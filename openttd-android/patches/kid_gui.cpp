/*
 * Unicorn Railways: the kid layer for OpenTTD on her Fire tablet (GPL v2, like OpenTTD).
 * Replaces the main toolbar and status bar with one column of big picture buttons:
 *   Road (drag), Bus stop (tap a road), New bus!, Rails (drag), Station (tap a rail), New train!,
 *   Undo (tap something of hers to remove it), Zoom in, Zoom out, Go fast, Home (save and back to the clock).
 * "New bus!" and "New train!" do everything for her: a depot next to her stops or stations if there isn't one,
 * a vehicle, orders between two of her stops, and off it goes.
 * Switched on by the UNICORN_KID environment variable (the kid app sets it), so the full edition is unchanged.
 */

#include "stdafx.h"
#include "openttd.h"
#include "window_gui.h"
#include "window_func.h"
#include "viewport_func.h"
#include "tilehighlight_func.h"
#include "command_func.h"
#include "company_func.h"
#include "core/backup_type.hpp"
#include "station_base.h"
#include "roadstop_base.h"
#include "depot_base.h"
#include "engine_base.h"
#include "engine_func.h"
#include "vehicle_base.h"
#include "order_base.h"
#include "road_map.h"
#include "rail_map.h"
#include "road.h"
#include "rail.h"
#include "road_gui.h"
#include "rail_gui.h"
#include "road_cmd.h"
#include "rail_cmd.h"
#include "station_cmd.h"
#include "landscape_cmd.h"
#include "vehicle_cmd.h"
#include "order_cmd.h"
#include "train_cmd.h"
#include "newgrf_station.h"
#include "newgrf_roadstop.h"
#include "cargotype.h"
#include "gfx_func.h"
#include "strings_func.h"
#include "error.h"
#include "fios.h"
#include "saveload/saveload.h"
#include "sound_func.h"
#include "widgets/road_widget.h"
#include "widgets/rail_widget.h"
#include "table/sprites.h"
#include "table/strings.h"

#include "safeguards.h"

bool _kid_mode = false;

enum KidWidgets : WidgetID {
	KW_ROAD, KW_BUSSTOP, KW_BUS, KW_RAIL, KW_STATION, KW_TRAIN, KW_UNDO, KW_ZOOM_IN, KW_ZOOM_OUT, KW_FAST, KW_HOME,
};

/** Save her world (save/kid.sav), which the app loads next time. */
void KidSave()
{
	if (_game_mode != GM_NORMAL) return;
	SaveOrLoad("kid.sav", SLO_SAVE, DFT_GAME_FILE, SAVE_DIR, false);
}

/** Home button / Back key: save and go back to the clock. */
void KidHome()
{
	KidSave();
	_exit_game = true;
}

/** The stock road/rail toolbars still do the dragging (their drag logic is the game's own); they are opened
 *  out of sight and only their tool is used. */
static void KidHide(Window *w)
{
	if (w == nullptr) return;
	w->left = -w->width - 4000;
	w->top = -w->height - 4000;
}
static void KidHideClass(WindowClass wc)
{
	for (Window *w : Window::Iterate()) if (w->window_class == wc) KidHide(w);
}

static TileIndex KidFindDepot(bool rail)
{
	for (const Depot *d : Depot::Iterate()) {
		if (!IsValidTile(d->xy) || GetTileOwner(d->xy) != _local_company) continue;
		if (rail ? IsRailDepotTile(d->xy) : (IsRoadDepotTile(d->xy) && HasTileRoadType(d->xy, RTT_ROAD))) return d->xy;
	}
	return INVALID_TILE;
}

/** A depot next to the road/rail near 'near', facing it; the game's own callback joins it up. */
static TileIndex KidBuildDepot(TileIndex near, bool rail)
{
	for (int r = 1; r <= 7; r++) {
		for (int dy = -r; dy <= r; dy++) {
			for (int dx = -r; dx <= r; dx++) {
				if (std::max(std::abs(dx), std::abs(dy)) != r) continue;
				int x = (int)TileX(near) + dx, y = (int)TileY(near) + dy;
				if (x < 1 || y < 1 || x >= (int)Map::MaxX() || y >= (int)Map::MaxY()) continue;
				TileIndex t = TileXY(x, y);
				for (DiagDirection d = DIAGDIR_BEGIN; d < DIAGDIR_END; d++) {
					TileIndex n = TileAddByDiagDir(t, d);
					if (!IsValidTile(n)) continue;
					if (rail) {
						if (!IsPlainRailTile(n) || GetTileOwner(n) != _local_company) continue;
						if (Command<CMD_BUILD_TRAIN_DEPOT>::Do({}, t, RAILTYPE_RAIL, d).Failed()) continue;
						if (Command<CMD_BUILD_TRAIN_DEPOT>::Post(STR_ERROR_CAN_T_BUILD_TRAIN_DEPOT, CcRailDepot, t, RAILTYPE_RAIL, d)) return t;
					} else {
						if (!IsNormalRoadTile(n) || !HasTileRoadType(n, RTT_ROAD)) continue;
						if (Command<CMD_BUILD_ROAD_DEPOT>::Do({}, t, ROADTYPE_ROAD, d).Failed()) continue;
						if (Command<CMD_BUILD_ROAD_DEPOT>::Post(GetRoadTypeInfo(ROADTYPE_ROAD)->strings.err_depot, CcRoadDepot, t, ROADTYPE_ROAD, d)) return t;
					}
				}
			}
		}
	}
	return INVALID_TILE;
}

static bool CarriesPassengers(const Engine *e)
{
	CargoType c = e->GetDefaultCargoType();
	return IsValidCargoType(c) && IsCargoInClass(c, CargoClasses({CargoClass::Passengers}));
}

/** Gives the new vehicle orders between two of her stops and starts it. */
static void KidRoute(VehicleID veh, StationID a, StationID b)
{
	Order o;
	o.MakeGoToStation(a);
	Command<CMD_INSERT_ORDER>::Do({DoCommandFlag::Execute}, veh, 0, o);
	Order p;
	p.MakeGoToStation(b);
	Command<CMD_INSERT_ORDER>::Do({DoCommandFlag::Execute}, veh, 1, p);
	Command<CMD_START_STOP_VEHICLE>::Do({DoCommandFlag::Execute}, veh, false);
	MarkWholeScreenDirty();
}

static void KidNewVehicle(bool train)
{
	Backup<CompanyID> cur_company(_current_company, _local_company);
	std::vector<const Station *> stops;
	for (const Station *st : Station::Iterate()) {
		if (st->owner != _local_company) continue;
		if (train ? st->facilities.Test(StationFacility::Train) : st->bus_stops != nullptr) stops.push_back(st);
	}
	if (stops.size() < 2) {
		ShowErrorMessage(GetEncodedString(train ? STR_ERROR_CAN_T_BUY_TRAIN : STR_ERROR_CAN_T_BUY_ROAD_VEHICLE), {}, WL_INFO);
		cur_company.Restore();
		return;
	}
	/* her vehicles take turns between her stops: 1-2, 2-3, ... */
	int count = 0;
	for (const Vehicle *v : Vehicle::Iterate()) if (v->owner == _local_company && v->IsPrimaryVehicle() && v->type == (train ? VEH_TRAIN : VEH_ROAD)) count++;
	const Station *a = stops[count % stops.size()], *b = stops[(count + 1) % stops.size()];
	TileIndex depot = KidFindDepot(train);
	if (depot == INVALID_TILE) depot = KidBuildDepot(train ? a->train_station.tile : a->bus_stops->xy, train);
	if (depot == INVALID_TILE) depot = KidBuildDepot(train ? b->train_station.tile : b->bus_stops->xy, train);
	if (depot == INVALID_TILE) {
		ShowErrorMessage(GetEncodedString(train ? STR_ERROR_CAN_T_BUILD_TRAIN_DEPOT : STR_ERROR_CAN_T_BUY_ROAD_VEHICLE), {}, WL_INFO);
		cur_company.Restore();
		return;
	}
	VehicleID veh = VehicleID::Invalid();
	if (!train) {
		for (const Engine *e : Engine::IterateType(VEH_ROAD)) {
			if (!IsEngineBuildable(e->index, VEH_ROAD, _local_company) || GetRoadTramType(e->VehInfo<RoadVehicleInfo>().roadtype) != RTT_ROAD || !CarriesPassengers(e)) continue;
			auto [res, id, refit_cap, refit_mail, cargo] = Command<CMD_BUILD_VEHICLE>::Do({DoCommandFlag::Execute}, depot, e->index, false, INVALID_CARGO, INVALID_CLIENT_ID);
			if (res.Succeeded()) { veh = id; break; }
		}
	} else {
		for (const Engine *e : Engine::IterateType(VEH_TRAIN)) {
			if (!IsEngineBuildable(e->index, VEH_TRAIN, _local_company) || e->VehInfo<RailVehicleInfo>().railveh_type == RAILVEH_WAGON || !HasPowerOnRail(e->VehInfo<RailVehicleInfo>().railtypes, RAILTYPE_RAIL)) continue;
			auto [res, id, refit_cap, refit_mail, cargo] = Command<CMD_BUILD_VEHICLE>::Do({DoCommandFlag::Execute}, depot, e->index, false, INVALID_CARGO, INVALID_CLIENT_ID);
			if (res.Succeeded()) { veh = id; break; }
		}
		if (veh != VehicleID::Invalid()) {
			for (const Engine *e : Engine::IterateType(VEH_TRAIN)) {
				if (!IsEngineBuildable(e->index, VEH_TRAIN, _local_company) || e->VehInfo<RailVehicleInfo>().railveh_type != RAILVEH_WAGON || !CarriesPassengers(e)) continue;
				for (int i = 0; i < 2; i++) {
					auto [res, wid, refit_cap, refit_mail, cargo] = Command<CMD_BUILD_VEHICLE>::Do({DoCommandFlag::Execute}, depot, e->index, false, INVALID_CARGO, INVALID_CLIENT_ID);
					if (res.Succeeded() && Vehicle::Get(wid)->First() != Vehicle::Get(veh)) Command<CMD_MOVE_RAIL_VEHICLE>::Do({DoCommandFlag::Execute}, wid, veh, false);
				}
				break;
			}
		}
	}
	if (veh != VehicleID::Invalid()) {
		KidRoute(veh, a->index, b->index);
		if (_settings_client.sound.confirm) SndPlayTileFx(SND_15_BEEP, depot);
	} else {
		ShowErrorMessage(GetEncodedString(train ? STR_ERROR_CAN_T_BUY_TRAIN : STR_ERROR_CAN_T_BUY_ROAD_VEHICLE), {}, WL_INFO);
	}
	cur_company.Restore();
	InvalidateWindowClassesData(WC_MAIN_WINDOW);
}

/** Which way a road or rail runs on a tile (for stops and stations). */
static Axis KidAxisAt(TileIndex t, bool rail)
{
	if (rail && IsPlainRailTile(t)) {
		TrackBits tb = GetTrackBits(t);
		if (tb == TRACK_BIT_Y) return AXIS_Y;
		return AXIS_X;
	}
	if (!rail && IsNormalRoadTile(t)) {
		RoadBits rb = GetRoadBits(t, RTT_ROAD);
		if ((rb & ROAD_Y) != 0 && (rb & ROAD_X) == 0) return AXIS_Y;
		return AXIS_X;
	}
	return AXIS_X;
}

static constexpr std::initializer_list<NWidgetPart> _nested_kid_widgets = {
	NWidget(NWID_VERTICAL),
		NWidget(NWID_HORIZONTAL),
			NWidget(WWT_IMGBTN, COLOUR_PINK, KW_ROAD), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_AUTOROAD, STR_ROAD_TOOLBAR_TOOLTIP_BUILD_AUTOROAD),
			NWidget(WWT_IMGBTN, COLOUR_PINK, KW_RAIL), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_AUTORAIL, STR_RAIL_TOOLBAR_TOOLTIP_BUILD_AUTORAIL),
		EndContainer(),
		NWidget(NWID_HORIZONTAL),
			NWidget(WWT_IMGBTN, COLOUR_PINK, KW_BUSSTOP), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_BUS_STATION, STR_ROAD_TOOLBAR_TOOLTIP_BUILD_BUS_STATION),
			NWidget(WWT_IMGBTN, COLOUR_PINK, KW_STATION), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_RAIL_STATION, STR_RAIL_TOOLBAR_TOOLTIP_BUILD_RAILROAD_STATION),
		EndContainer(),
		NWidget(NWID_HORIZONTAL),
			NWidget(WWT_IMGBTN, COLOUR_LIGHT_BLUE, KW_BUS), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_TRUCKLIST, STR_NULL),
			NWidget(WWT_IMGBTN, COLOUR_LIGHT_BLUE, KW_TRAIN), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_TRAINLIST, STR_NULL),
		EndContainer(),
		NWidget(NWID_HORIZONTAL),
			NWidget(WWT_IMGBTN, COLOUR_ORANGE, KW_UNDO), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_DYNAMITE, STR_NULL),
			NWidget(WWT_IMGBTN, COLOUR_GREEN, KW_FAST), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_FASTFORWARD, STR_NULL),
		EndContainer(),
		NWidget(NWID_HORIZONTAL),
			NWidget(WWT_IMGBTN, COLOUR_GREY, KW_ZOOM_IN), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_ZOOMIN, STR_NULL),
			NWidget(WWT_IMGBTN, COLOUR_GREY, KW_ZOOM_OUT), SetMinimalSize(44, 40), SetSpriteTip(SPR_IMG_ZOOMOUT, STR_NULL),
		EndContainer(),
		NWidget(WWT_IMGBTN, COLOUR_MAUVE, KW_HOME), SetMinimalSize(88, 36), SetFill(1, 0), SetSpriteTip(SPR_IMG_TOWN, STR_NULL),
	EndContainer(),
};

struct KidToolbarWindow : Window {
	WidgetID tool = INVALID_WIDGET; ///< the kid window's own tap tool (bus stop, station, undo)

	KidToolbarWindow(WindowDesc &desc) : Window(desc)
	{
		this->InitNested(0);
		this->flags.Reset(WindowFlag::WhiteBorder);
	}

	Point OnInitialPosition([[maybe_unused]] int16_t sm_width, [[maybe_unused]] int16_t sm_height, [[maybe_unused]] int window_number) override
	{
		return {0, 0};
	}

	void Lower(WidgetID w)
	{
		for (WidgetID i = KW_ROAD; i <= KW_HOME; i++) this->SetWidgetLoweredState(i, i == w);
		this->SetDirty();
	}

	void StopTools()
	{
		ResetObjectToPlace();
		CloseWindowByClass(WC_BUILD_TOOLBAR);
		CloseWindowByClass(WC_BUS_STATION);
		CloseWindowByClass(WC_BUILD_STATION);
		this->tool = INVALID_WIDGET;
		this->Lower(INVALID_WIDGET);
	}

	void OnClick([[maybe_unused]] Point pt, WidgetID widget, [[maybe_unused]] int click_count) override
	{
		if (_settings_client.sound.click_beep) SndPlayFx(SND_15_BEEP);
		switch (widget) {
			case KW_ROAD:
			case KW_RAIL: {
				bool again = this->IsWidgetLowered(widget);
				this->StopTools();
				if (again) break;
				Window *w = widget == KW_ROAD ? ShowBuildRoadToolbar(ROADTYPE_ROAD) : ShowBuildRailToolbar(RAILTYPE_RAIL);
				if (w == nullptr) break;
				KidHide(w);
				w->OnClick({0, 0}, widget == KW_ROAD ? (WidgetID)WID_ROT_AUTOROAD : (WidgetID)WID_RAT_AUTORAIL, 1);
				KidHide(w);
				this->Lower(widget);
				break;
			}
			case KW_BUSSTOP:
			case KW_STATION:
			case KW_UNDO: {
				bool again = this->IsWidgetLowered(widget);
				this->StopTools();
				if (again) break;
				CursorID c = widget == KW_BUSSTOP ? SPR_CURSOR_BUS_STATION : widget == KW_STATION ? SPR_CURSOR_RAIL_STATION : ANIMCURSOR_DEMOLISH;
				SetObjectToPlace(c, PAL_NONE, HT_RECT, this->window_class, this->window_number);
				this->tool = widget;
				this->Lower(widget);
				break;
			}
			case KW_BUS: this->StopTools(); KidNewVehicle(false); break;
			case KW_TRAIN: this->StopTools(); KidNewVehicle(true); break;
			case KW_ZOOM_IN: DoZoomInOutWindow(ZOOM_IN, GetMainWindow()); break;
			case KW_ZOOM_OUT: DoZoomInOutWindow(ZOOM_OUT, GetMainWindow()); break;
			case KW_FAST: ChangeGameSpeed(_game_speed == 100); this->SetWidgetLoweredState(KW_FAST, _game_speed != 100); this->SetDirty(); break;
			case KW_HOME: KidHome(); break;
		}
	}

	void OnPlaceObject([[maybe_unused]] Point pt, TileIndex tile) override
	{
		Backup<CompanyID> cur_company(_current_company, _local_company);
		switch (this->tool) {
			case KW_BUSSTOP: {
				Axis axis = KidAxisAt(tile, false);
				Command<CMD_BUILD_ROAD_STOP>::Post(GetRoadTypeInfo(ROADTYPE_ROAD)->strings.err_build_station[to_underlying(RoadStopType::Bus)], CcRoadStop,
						tile, 1, 1, RoadStopType::Bus, true, axis == AXIS_X ? DIAGDIR_NE : DIAGDIR_NW, ROADTYPE_ROAD, ROADSTOP_CLASS_DFLT, 0, StationID::Invalid(), false);
				break;
			}
			case KW_STATION: {
				Axis axis = KidAxisAt(tile, true);
				Command<CMD_BUILD_RAIL_STATION>::Post(STR_ERROR_CAN_T_BUILD_RAILROAD_STATION, CcStation, tile, RAILTYPE_RAIL, axis, 1, 3, STAT_CLASS_DFLT, 0, StationID::Invalid(), false);
				break;
			}
			case KW_UNDO:
				/* only her own things (not town roads or houses) */
				if (IsTileType(tile, MP_HOUSE) || GetTileOwner(tile) != _local_company) {
					if (_settings_client.sound.click_beep) SndPlayFx(SND_15_BEEP);
					break;
				}
				Command<CMD_LANDSCAPE_CLEAR>::Post(STR_ERROR_CAN_T_CLEAR_THIS_AREA, CcPlaySound_CONSTRUCTION_OTHER, tile);
				break;
		}
		cur_company.Restore();
	}

	void OnPlaceObjectAbort() override
	{
		this->tool = INVALID_WIDGET;
		this->Lower(INVALID_WIDGET);
	}

	void OnRealtimeTick([[maybe_unused]] uint delta_ms) override
	{
		/* keep the stock pickers that open with a tool out of sight */
		KidHideClass(WC_BUILD_TOOLBAR);
		KidHideClass(WC_BUS_STATION);
		KidHideClass(WC_BUILD_STATION);
		KidHideClass(WC_SELECT_STATION);
		bool active = _thd.place_mode != HT_NONE;
		if (!active && (this->IsWidgetLowered(KW_ROAD) || this->IsWidgetLowered(KW_RAIL))) this->Lower(INVALID_WIDGET);
	}
};

static WindowDesc _kid_toolbar_desc(
	WDP_MANUAL, {}, 0, 0,
	WC_KID_TOOLBAR, WC_NONE,
	{WindowDefaultFlag::NoClose},
	_nested_kid_widgets
);

void ShowKidToolbar()
{
	CloseWindowByClass(WC_KID_TOOLBAR);
	new KidToolbarWindow(_kid_toolbar_desc);
}
