#!/usr/bin/env python3
"""Nate Bloom Box: pair one Bluetooth device with the code shown on the box's screen (nb-box-helper bt-pair, as root).
   bt-pair.py AA:BB:CC:DD:EE:FF
A keyboard usually asks you to type a 6-digit code on it: the code goes to /run/nb-box/bt-pair.json and the home
screen shows it large. A device that shows a code for the box to enter: the home screen shows a keypad and writes
the digits to /run/nb-box/bt-reply. Codes to confirm are accepted (and shown). Nothing here needs a keyboard."""
import json, os, re, sys, time
import dbus, dbus.service, dbus.mainloop.glib
from gi.repository import GLib

RUN = "/run/nb-box"
ST, REPLY = RUN + "/bt-pair.json", RUN + "/bt-reply"
MAC = (sys.argv[1] if len(sys.argv) > 1 else "").upper()
if not re.fullmatch(r"([0-9A-F]{2}:){5}[0-9A-F]{2}", MAC):
    sys.exit("bad address")
os.makedirs(RUN, exist_ok=True)


def put(state, **k):
    k.update(state=state, mac=MAC, t=time.time())
    with open(ST + ".part", "w") as f:
        json.dump(k, f)
    os.chmod(ST + ".part", 0o644)
    os.replace(ST + ".part", ST)


def wait_reply(limit=60):
    try:
        os.remove(REPLY)
    except OSError:
        pass
    end = time.time() + limit
    while time.time() < end:
        try:
            v = open(REPLY).read().strip()
            os.remove(REPLY)
            if re.fullmatch(r"\d{1,6}", v):
                return v
            if v == "cancel":
                break
        except OSError:
            pass
        time.sleep(0.25)
    raise dbus.DBusException("org.bluez.Error.Canceled", "no code entered")


class Agent(dbus.service.Object):
    @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
    def Release(self): pass

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="s")
    def RequestPinCode(self, device):       # (older keyboards: type this PIN on the keyboard, then Enter)
        pin = "%04d" % (int.from_bytes(os.urandom(2), "big") % 10000)
        put("type", code=pin)
        return pin

    @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
    def DisplayPinCode(self, device, pincode): put("type", code=str(pincode))

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="u")
    def RequestPasskey(self, device):        # (the device shows a code: the box's keypad enters it)
        put("enter")
        return dbus.UInt32(int(wait_reply()))

    @dbus.service.method("org.bluez.Agent1", in_signature="ouq", out_signature="")
    def DisplayPasskey(self, device, passkey, entered): put("type", code="%06d" % passkey, entered=int(entered))

    @dbus.service.method("org.bluez.Agent1", in_signature="ou", out_signature="")
    def RequestConfirmation(self, device, passkey): put("confirm", code="%06d" % passkey)

    @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="")
    def RequestAuthorization(self, device): pass

    @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
    def AuthorizeService(self, device, uuid): pass

    @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
    def Cancel(self): put("failed", message="cancelled by the device")


dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SystemBus()
loop = GLib.MainLoop()
put("starting")
om = dbus.Interface(bus.get_object("org.bluez", "/"), "org.freedesktop.DBus.ObjectManager")


def find():
    for path, ifs in om.GetManagedObjects().items():
        d = ifs.get("org.bluez.Device1")
        if d and str(d.get("Address", "")).upper() == MAC:
            return path
    return None


dev_path = find()
if not dev_path:   # (gone from the list since the scan: look again for 10 s)
    for path, ifs in om.GetManagedObjects().items():
        if "org.bluez.Adapter1" in ifs:
            ad = dbus.Interface(bus.get_object("org.bluez", path), "org.bluez.Adapter1")
            try:
                ad.StartDiscovery()
            except dbus.DBusException:
                pass
            for _ in range(20):
                time.sleep(0.5)
                dev_path = find()
                if dev_path:
                    break
            try:
                ad.StopDiscovery()
            except dbus.DBusException:
                pass
            break
if not dev_path:
    put("failed", message="not found: put it in pairing mode and tap Find devices")
    sys.exit(4)

agent_path = "/nbbox/agent"
Agent(bus, agent_path)
mgr = dbus.Interface(bus.get_object("org.bluez", "/org/bluez"), "org.bluez.AgentManager1")
mgr.RegisterAgent(agent_path, "KeyboardDisplay")
mgr.RequestDefaultAgent(agent_path)
dev = dbus.Interface(bus.get_object("org.bluez", dev_path), "org.bluez.Device1")
props = dbus.Interface(bus.get_object("org.bluez", dev_path), "org.freedesktop.DBus.Properties")
result = {"code": 1}


def done():
    try:
        props.Set("org.bluez.Device1", "Trusted", dbus.Boolean(True))
        dev.Connect(timeout=20)
    except dbus.DBusException:
        pass   # (paired and trusted: it connects by itself when it wakes)
    put("paired")
    result["code"] = 0
    loop.quit()


def failed(err):
    name = err.get_dbus_name() if hasattr(err, "get_dbus_name") else ""
    if name == "org.bluez.Error.AlreadyExists":
        return done()
    put("failed", message=str(err.get_dbus_message() if hasattr(err, "get_dbus_message") else err)[:120])
    loop.quit()


if props.Get("org.bluez.Device1", "Paired"):
    done()
else:
    dev.Pair(reply_handler=done, error_handler=failed, timeout=75)
    GLib.timeout_add_seconds(80, lambda: (put("failed", message="timed out"), loop.quit()))
    loop.run()
try:
    mgr.UnregisterAgent(agent_path)
except dbus.DBusException:
    pass
sys.exit(result["code"])
