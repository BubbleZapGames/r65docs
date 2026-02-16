---
sidebar_position: 1
title: SNES ROM Header
description: Configuring the SNES ROM header with the #[snesrom] attribute.
---

# SNES ROM Header

Configure the SNES ROM header using the `#[snesrom(...)]` attribute. This generates the appropriate `.SNESHEADER` block in the WLA-DX assembly output.

## Syntax

```rust
#[snesrom(name="MY GAME", version=0x01, hirom, fastrom)]
```

## Required Parameter

| Parameter | Description |
|-----------|-------------|
| `name` | ROM name (max 21 characters, padded or truncated automatically) |

## Optional Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `id` | `"SNES"` | Cartridge ID (4 characters) |
| `cartridge_type` | `0x00` | Cartridge type byte |
| `sram_size` | `0x00` | SRAM size byte |
| `country` | `0x01` | Country code |
| `version` | `0x00` | ROM version number |

## Memory Mapping Flags

Mutually exclusive:

| Flag | Description |
|------|-------------|
| `lorom` | LoROM mapping (default) |
| `hirom` | HiROM mapping |
| `exhirom` | ExHiROM mapping |

## ROM Speed Flags

Mutually exclusive:

| Flag | Description |
|------|-------------|
| `slowrom` | SlowROM timing (default) |
| `fastrom` | FastROM timing |

## Country Codes

| Code | Region |
|------|--------|
| `0x00` | Japan |
| `0x01` | USA |
| `0x02` | Europe |

## Cartridge Types

| Code | Type |
|------|------|
| `0x00` | ROM only |
| `0x01` | ROM + RAM |
| `0x02` | ROM + RAM + Battery |

## Generated Output

For `#[snesrom(name="MY GAME", version=0x01, hirom, fastrom)]`:

```asm
.SNESHEADER
  ID "SNES"
  NAME "MY GAME              "
  HIROM
  FASTROM
  CARTRIDGETYPE $00
  ROMSIZE $08
  SRAMSIZE $00
  COUNTRY $01
  LICENSEECODE $00
  VERSION $01
.ENDSNES
```

See the [WLA-DX documentation](https://wla-dx.readthedocs.io/) for complete parameter lists and details.
