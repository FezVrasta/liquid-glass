# Liquid Glass

A stunning liquid glass backdrop effect for Home Assistant cards. Uses SVG displacement filters and squircle masking for a modern, frosted glass appearance.

![Demo](demo.gif)

## Features

- High-performance SVG displacement filter backdrop
- Custom squircle masking for buttery-smooth corners
- Decorative glass rim effect
- Simple card_mod integration
- Automatic application via classes or configuration
- Custom radius and rim control

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Click the three dots menu and select "Custom repositories"
3. Add this repository URL and select "Lovelace" as the category
4. Search for "Liquid Glass" and install
5. Restart Home Assistant

### Manual

1. Download `liquid-glass.js` from the [latest release](../../releases/latest)
2. Copy to `config/www/liquid-glass.js`
3. Add resource in Settings > Dashboards > Resources:
   ```
   /local/liquid-glass.js
   ```

## Usage

### Using card_mod (Recommended)

Add the `liquid-glass` class to any card using [card_mod](https://github.com/thomasloven/lovelace-card-mod):

```yaml
type: entities
card_mod:
  class: liquid-glass
entities:
  - light.living_room
```

### Options (via classes)

- `liquid-glass`: Apply the basic effect
- `liquid-glass-squircle`: Enable squircle corner masking
- `liquid-glass-no-rim`: Hide the decorative rim effect

### Customization (via CSS variables)

```yaml
card_mod:
  class: liquid-glass-squircle
  style: |
    :host {
      --liquid-glass-radius: 24px;
      --liquid-glass-blur: 8px;
    }
```

## License

MIT License - see [LICENSE](LICENSE) for details.
