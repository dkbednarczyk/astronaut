---
title: "Reverse engineering a gaming mouse"
pubDate: 2026-01-20
---

## Why?

A few months ago, the wireless dongle for my old mouse broke. Rather than getting
a replacement, I got a new mouse altogether: the [VXE MAD R](https://www.atk.store/products/vxe-mad-r-series-wireless-mouse).
The Windows configuration software works *okay* through Wine, but it's poorly translated
and I'd rather have a native solution. There is also a web version of it for Chromium browsers,
but it lacks a PWA, and not being able to change my settings offline is a big no.
[Logitech users were victims of this](https://x.com/willccbb/status/2008743770024743200?s=20)
not too long ago.

So, I decided to reverse engineer the mouse and [build my own](https://github.com/dkbednarczyk/madr).
I've documented my process here and some of the findings I made along the way.

## Workflow

I used Wireshark to capture the USB traffic between the mouse and the web configuration
software. You can talk to the mouse in one of two ways:

- Changing or applying new settings requires sending a feature report.
- Requesting the current data is handled through input/output reports, with the mouse
  sending back the current configuration via an interrupt.

In my testing, regardless
of if any settings were applied correctly by a feature report, the mouse always
seems to respond with a success status. The values needed
for a feature report to the mouse are deterministic, so we can safely assume that
the mouse isn't lying.

## Selected findings

### DPI stage and polling rate selection

These settings are sent in tandem, likely because they are relatively
simple and combining the data for both still fits within the limits of a 17-byte
feature report.

| Byte index | Description                     |
|------|---------------------------------|
|  0   | Report ID `0x08`                |
|  1   | Write command `0x07`            |
| 2-4  | Padding `0x00`                  |
|  5   | Identifier `0x06`               |
|  6   | Encoded polling rate            |
|  7   | Polling rate checksum           |
| 8-9  | Magic bits                      |
| 10   | DPI stage index                 |
| 11   | DPI stage checksum              |
| 12-15| Padding                         |
| 16   | End byte `0x41`                 |

The DPI stage is simply the index of the selected stage. The MAD R
supports up to 8 stages in total. The polling rate of the mouse can be set to a
few distinct values between 125Hz and 8000Hz, so the raw value is mapped to a specific byte:
```rust
let rate_byte: u8 = match rate {
    125 => 0x08,
    250 => 0x04,
    500 => 0x02,
    1000 => 0x01,
    2000 => 0x10,
    4000 => 0x20,
    8000 => 0x40,
    _ => panic!(),
};
```

The checksum for both the DPI stage and polling rate is simply a subtraction from `0x55`,
maybe chosen for its unique bit pattern of `01010101` as some sort of unique guard value.
Sending an invalid polling rate or DPI stage value results in
the mouse freezing up and needing the "unplug it and plug it back in" treatment
to work again.

What's interesting about the polling rates specifically is that they follow a clear
bit-shifting pattern for values supported by the mouse while wired: `(0x08 >> n)` for
rates up to 1000Hz. The wireless sensor (dongle?) supports the higher polling rates,
which suggests they were added later to the firmware. 

I wasn't able to figure out the purpose of the magic bits at bytes 8-9. That pattern
of `0x04, 0x51` or some other similar combination summing to `0x55` appears in
multiple other parts of the protocol but just keeping them as is regardless of other
input data seems to work so... 🤷.

### Modifying DPI stages

**More coming soon...**