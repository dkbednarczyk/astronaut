---
title: "Reverse engineering a gaming mouse"
description: "A deep dive into the protocol of the VXE MAD R."
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

[libratbag](https://github.com/libratbag/libratbag) was my first stop
as to not reinvent the wheel, but the MAD R isn't supported there.
I seemed to be [treading down a beaten path](https://github.com/libratbag/piper/issues/1064)
by looking there first.

So, I decided to reverse engineer the mouse and build [my own CLI tool](https://github.com/dkbednarczyk/madr).

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

The kernel documentation has a good introduction to the different types of 
[HID report descriptors](https://docs.kernel.org/hid/hidintro.html) if you want
a deeper understanding of what they are.

## Selected findings

### DPI stage and polling rate selection

These settings are sent in tandem, likely because they are relatively
simple and combining the data for both still fits within the limits of a 17-byte
feature report.

| Byte | Name | Description |
|------|------|-------------|
| 0-1 | Header | Always `08 07` |
| 2-4 | Padding | Always `00 00 00` |
| 5 | Identifier | Always `06` |
| 6 | Polling rate | Encoded polling rate value |
| 7 | Checksum | Polling rate checksum |
| 8-9 | Magic bits | Unknown purpose |
| 10 | DPI stage | Selected DPI stage index |
| 11 | Checksum | DPI stage checksum |
| 12-15 | Padding | Always `00 00 00 00` |
| 16 | End byte | Always `41` |

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
so I speculate support for it might have been added later in the firmware. 

I wasn't able to figure out the purpose of the magic bits at bytes 8-9. That pattern
of `0x04, 0x51` or some other similar combination summing to `0x55` appears in
multiple other parts of the protocol. Keeping them as is seems to work fine, and
changing them (as long as they still sum to the same value) doesn't seem to have
any apparent effect.

### Modifying DPI stages


#### DPI stage update structure
| Byte | Name | Description |
|-------|------|-------------|
| 0-1 | Header | Always `08 07` |
| 2-3 | Padding | Always `00 00` |
| 4 | ID | Identifies type and stage pair |
| 5 | Length | Always `08` |
| 6-9 | Stage A | First stage data (3 bytes) + checksum |
| 10-13 | Stage B | Second stage data (3 bytes) + checksum |
| 14-15 | Padding | Always `00 00` |
| 16 | End Checksum | `0x94 - report_id` |

Each one contains the data for two stages, and the ID is calculated as `0x04 + (index * 0x08)`,
using the zero-based index of the pair of stages being modified. So, the first report
modifies stages 1 and 2, the second stages 3 and 4, and so on. 

#### DPI stage data structure
| Byte | Content |
|------|---------|
| 0 | X DPI low byte |
| 1 | Y DPI low byte |
| 2 | High byte container |
| 3 | Checksum |

The MAD R supports independent X and Y DPI values between 100 and 30,000, in increments of 50 DPI.
The mouse encodes the values using the calculation `(DPI / 50) - 1`. For example,
a DPI of 800 maps to 15, or `0x0F`. One obvious
limitation of this is the maximum value using this method is `0xFF`,
which corresponds to 12,800 DPI. Any value above that would wrap around. So, the
data for a given stage is stored in three bytes + a checksum byte:

Let's say we want to store 800 DPI for X and 15,000 DPI for Y (a little absurd, but it
helps for the demonstration).
The calculations would be as follows:
```rust
let encoded_x = (x_dpi / 50) - 1; // 15 -> 0x0F
let encoded_y = (y_dpi / 50) - 1; // 299 -> 0x012B

let x_low = (encoded_x & 0xFF) as u8; // 0x0F
let y_low = (encoded_y & 0xFF) as u8; // 0x2B

let x_high = ((encoded_x >> 8) & 0xFF) as u8; // 0x00
let y_high = ((encoded_y >> 8) & 0xFF) as u8; // 0x01

let high_container = (x_high << 6) | (y_high << 2); // 0x10
let checksum = 0x55.wrapping_sub(x_low)
                   .wrapping_sub(y_low)
                   .wrapping_sub(high_container); // 0x35

// Resulting bytes: [0x0F, 0x2B, 0x10, 0x35]
```

> What the hell?

For `x_low` and `y_low`, we want the lowest 8 bits of each DPI value. Taking the 
logical AND with `0xFF` (or `11111111` in binary)
strips away the higher bits and leaves us with just the lower byte.

For `x_high` and `y_high`, we right-shift by 8 to extract the upper bits. The maximum 
DPI value is 30,000, which encodes to 599 (`0x0257`), meaning the high bytes can only 
be `0x00`, `0x01`, or `0x02`: just 2 bits each.

The high container packs both values into a single byte, giving a layout of `xx00yy00`.
This method fits two 10-bit values into three bytes instead of four.

### RGB accent color modification

The web configuration software allows changing the RGB accent color for each DPI stage:

<video alt="Video demonstrating Wireshark logs when modifying DPI stage RGB value" controls>  
  <source src="https://cdn.bednarczyk.xyz/videos/rgb-packet-demonstration.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

This mouse doesn't have an LED that signifies the current DPI stage (or
rather, any LEDs at all). Maybe this functionality would have been more obvious to
spot if it did. I'm sure other models by ATK have this feature, and it's just
easier to reuse the same logic across multiple devices.

An RGB update follows the same structure as a full DPI stage update report, with the only
difference being the content of the first three bytes.

The report ID is also calculated the same way, but with an offset of `0x24` instead of `0x04`.

#### RGB update structure
| Byte | Content |
|------|---------|
| 0 | Red (0-255) |
| 1 | Green (0-255) |
| 2 | Blue (0-255) |
| 3 | Checksum |

Much more straightforward than the DPI stage data structure. Each color channel
fits into a single byte, and the checksum is calculated in the same way as before,
using a wrapping subtraction from `0x55`.

You can see this structure in the "Data Fragment" section of the Wireshark capture
above (bottom left panel, last value): in that example DPI stage 1 had a color of (255, 255, 255) = `ffffff`, which didn't change. Its checksum of `0x58` follows and then comes the updated color I selected for stage 2, so (66, 128, 66) = `428042`.

## Conclusion

What started as frustration with vendor software turned into a rewarding deep dive
into USB protocols and bit manipulation. Reverse engineering this protocol was
actually quite fun and I learned a lot about how USB HID devices actually communicate
with their host systems.

I will admit, this is not my first time making this kind of project. My old mouse
I mentioned at the start of this post was a Glorious Model D Wireless, and I have
maintained a similar tool, [`mxw`](https://github.com/dkbednarczyk/mxw) for it, but instead
of having to reverse engineer the protocol from scratch, I was able to build
upon the work of Ola Næss Kaldestad [who had already done the heavy lifting](https://github.com/korkje/mow)
for the similar Model O. I still maintain (and use!) that tool, with members of
the community contributing support for new devices and features.

[The implementation](https://github.com/dkbednarczyk/madr) for the VXE MAD R
now works reliably for
configuring DPI stages, getting detailed battery info, and other settings fully locally.
I'm hopeful that others reading this with different models of the mouse or other ATK mice 
will be able to use it for their own devices as well. It might also serve as a
basis for eventual implementation into `libratbag` or a similar project.

Most importantly, reverse engineering this mouse gave me full ownership over a device
I paid for. If you're stuck with poorly supported hardware, Wireshark and some patience can
go a long way.
