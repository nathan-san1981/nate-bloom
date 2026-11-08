-- Nate Bloom Box (WirePlumber 0.4): a USB headphone cable or interface is the output whenever it's plugged in,
-- and it never goes to sleep (no click or lost first note after a pause).
table.insert(alsa_monitor.rules, {
  matches = { { { "node.name", "matches", "alsa_output.usb-*" } } },
  apply_properties = {
    ["priority.driver"] = 2000,
    ["priority.session"] = 2000,
    ["session.suspend-timeout-seconds"] = 0,
    ["api.alsa.period-size"] = 256,
  },
})
