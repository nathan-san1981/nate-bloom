/* ---- Touch layer for tablets (Unicorn Railways and OpenTTD for the S10 FE+) ----
 * SDL's own touch-to-mouse is off; fingers are turned into game input here:
 *   tap                = left click            drag one finger   = left-drag (scrolls the map, draws track/road)
 *   press and hold     = right click (tooltips, cancel)
 *   pinch              = zoom at the fingers   drag two fingers  = scroll the map
 *   two-finger tap / Back key = cancel the build tool, or close the front window */
namespace {
struct TouchFinger { SDL_FingerID id; int x, y; };
enum TouchMode { TM_IDLE, TM_PENDING, TM_DRAG, TM_TWO, TM_DONE };
struct TouchState {
	std::vector<TouchFinger> fingers;
	TouchMode mode = TM_IDLE;
	int sx = 0, sy = 0;          ///< where the first finger went down
	uint32_t t0 = 0;             ///< when it went down
	float pinch0 = 0;            ///< finger distance at the last zoom step
	int mx = 0, my = 0;          ///< two-finger midpoint
	int moved2 = 0;              ///< how far two fingers have travelled
	uint32_t t2 = 0;             ///< when the second finger went down
};
TouchState _touch;
constexpr int TOUCH_SLOP = 14;          ///< pixels a finger may wander and still be a tap
constexpr uint32_t TOUCH_HOLD_MS = 550; ///< press-and-hold time for a right click
}

static void TouchCursor(int x, int y)
{
	_cursor.UpdateCursorPosition(x, y);
	HandleMouseEvents();
}

static void TouchLeft(bool down)
{
	_left_button_down = down;
	if (!down) _left_button_clicked = false;
	HandleMouseEvents();
}

static void TouchRightClick(int x, int y)
{
	TouchCursor(x, y);
	_right_button_down = true;
	_right_button_clicked = true;
	HandleMouseEvents();
	_right_button_down = false;
	HandleMouseEvents();
}

/** Two-finger tap or Back: cancel the tool being used, otherwise close the front window. */
static void TouchBack()
{
	if (_thd.place_mode != HT_NONE) {
		ResetObjectToPlace();
		return;
	}
	for (Window *w : Window::IterateFromFront()) {
		switch (w->window_class) {
			case WC_MAIN_WINDOW: case WC_MAIN_TOOLBAR: case WC_STATUS_BAR: case WC_TOOLTIPS: case WC_SELECT_GAME:
				continue;
			default: break;
		}
		if (w->flags.Test(WindowFlag::Sticky)) continue;
		w->Close();
		return;
	}
}

static void TouchPos(const SDL_TouchFingerEvent &f, SDL_Window *win, int &x, int &y)
{
	int w, h;
	SDL_GetWindowSize(win, &w, &h);
	x = Clamp((int)(f.x * w), 0, w - 1);
	y = Clamp((int)(f.y * h), 0, h - 1);
}

static float TouchDist() { float dx = _touch.fingers[0].x - _touch.fingers[1].x, dy = _touch.fingers[0].y - _touch.fingers[1].y; return std::sqrt(dx * dx + dy * dy); }

/** Called every poll: turns a held, still finger into a right click. */
static void TouchTick()
{
	if (_touch.mode == TM_PENDING && _touch.fingers.size() == 1 && SDL_GetTicks() - _touch.t0 >= TOUCH_HOLD_MS) {
		TouchRightClick(_touch.sx, _touch.sy);
		_touch.mode = TM_DONE;
	}
}

/** @return true if the event was touch input (handled here). */
static bool TouchEvent(const SDL_Event &ev, SDL_Window *win)
{
	switch (ev.type) {
		case SDL_MOUSEMOTION: return ev.motion.which == SDL_TOUCH_MOUSEID;
		case SDL_MOUSEBUTTONDOWN: case SDL_MOUSEBUTTONUP: return ev.button.which == SDL_TOUCH_MOUSEID;
		case SDL_MOUSEWHEEL: return ev.wheel.which == SDL_TOUCH_MOUSEID;

		case SDL_FINGERDOWN: {
			int x, y;
			TouchPos(ev.tfinger, win, x, y);
			_touch.fingers.push_back({ev.tfinger.fingerId, x, y});
			if (_touch.fingers.size() == 1) {
				_touch.mode = TM_PENDING;
				_touch.sx = x; _touch.sy = y; _touch.t0 = SDL_GetTicks();
				TouchCursor(x, y);
			} else if (_touch.fingers.size() == 2) {
				if (_touch.mode == TM_DRAG) TouchLeft(false);
				_touch.mode = TM_TWO;
				_touch.pinch0 = TouchDist();
				_touch.mx = (_touch.fingers[0].x + _touch.fingers[1].x) / 2;
				_touch.my = (_touch.fingers[0].y + _touch.fingers[1].y) / 2;
				_touch.moved2 = 0;
				_touch.t2 = SDL_GetTicks();
			}
			return true;
		}

		case SDL_FINGERMOTION: {
			int x, y;
			TouchPos(ev.tfinger, win, x, y);
			for (auto &f : _touch.fingers) if (f.id == ev.tfinger.fingerId) { f.x = x; f.y = y; }
			if (_touch.mode == TM_PENDING && _touch.fingers.size() == 1) {
				if (std::abs(x - _touch.sx) + std::abs(y - _touch.sy) > TOUCH_SLOP) {
					TouchCursor(_touch.sx, _touch.sy);
					TouchLeft(true);
					TouchCursor(x, y);
					_touch.mode = TM_DRAG;
				}
			} else if (_touch.mode == TM_DRAG) {
				TouchCursor(x, y);
			} else if (_touch.mode == TM_TWO && _touch.fingers.size() >= 2) {
				int nx = (_touch.fingers[0].x + _touch.fingers[1].x) / 2;
				int ny = (_touch.fingers[0].y + _touch.fingers[1].y) / 2;
				Window *mw = GetMainWindow();
				if (mw != nullptr && mw->viewport != nullptr) {
					mw->viewport->dest_scrollpos_x -= ScaleByZoom(nx - _touch.mx, mw->viewport->zoom);
					mw->viewport->dest_scrollpos_y -= ScaleByZoom(ny - _touch.my, mw->viewport->zoom);
				}
				_touch.moved2 += std::abs(nx - _touch.mx) + std::abs(ny - _touch.my);
				_touch.mx = nx; _touch.my = ny;
				float d = TouchDist();
				if (_touch.pinch0 > 1 && (d / _touch.pinch0 > 1.3f || d / _touch.pinch0 < 0.77f) && mw != nullptr) {
					_cursor.UpdateCursorPosition(nx, ny);
					ZoomInOrOutToCursorWindow(d > _touch.pinch0, mw);
					_touch.pinch0 = d;
					_touch.moved2 += 100;
				}
			}
			return true;
		}

		case SDL_FINGERUP: {
			auto it = std::find_if(_touch.fingers.begin(), _touch.fingers.end(), [&](const TouchFinger &f) { return f.id == ev.tfinger.fingerId; });
			if (it != _touch.fingers.end()) _touch.fingers.erase(it);
			if (!_touch.fingers.empty()) return true;
			switch (_touch.mode) {
				case TM_PENDING: // a tap
					TouchCursor(_touch.sx, _touch.sy);
					TouchLeft(true);
					TouchLeft(false);
					break;
				case TM_DRAG:
					TouchLeft(false);
					break;
				case TM_TWO:
					if (_touch.moved2 < 2 * TOUCH_SLOP && SDL_GetTicks() - _touch.t2 < 350) TouchBack();
					break;
				default: break;
			}
			_touch.mode = TM_IDLE;
			return true;
		}

		case SDL_KEYDOWN:
			if (ev.key.keysym.sym == SDLK_AC_BACK) {
				if (ev.key.repeat == 0) TouchBack();
				return true;
			}
			return false;

		case SDL_KEYUP:
			return ev.key.keysym.sym == SDLK_AC_BACK;

		default: return false;
	}
}
/* ---- end of touch layer ---- */
