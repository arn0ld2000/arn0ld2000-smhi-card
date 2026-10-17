# arn0ld2000 SMHI Card

A custom Lovelace card for Home Assistant users who get their weather forecasts from the **SMHI integration**. It turns a Home Assistant `weather.*` entity into a detailed, interactive forecast dashboard. No SMHI API key or separate backend service is required.

The card is designed to be installed as a frontend resource. It does not control devices or change Home Assistant settings.

## What the card shows

- Current condition and temperature, with animated weather artwork.
- Daily forecast cards with high and low temperatures, a temperature-range bar, precipitation, wind speed, and direction.
- An hourly forecast for the selected day, including a temperature graph, precipitation, wind, gusts, and direction.
- Current wind, gusts, humidity, calculated dew point, and pressure context.
- Sunrise, sunset, daylight length, moon phase, and lunar rise/set times.
- Cloud cover and, when the data is available, thunder probability and frozen-precipitation information.
- One to three forecast locations, selectable from the card header.

The interface text is currently in Swedish. Data is requested from Home Assistant with its `weather.get_forecasts` action, so each weather entity must provide daily and hourly forecast data. Home Assistant notes that an entity may not supply every forecast field; unavailable values are omitted by the integration. See the [Home Assistant weather forecast documentation](https://www.home-assistant.io/actions/weather.get_forecasts/).

## Requirements

- Home Assistant with the SMHI integration set up for at least one location.
- A `weather.*` entity for each location you want to show.
- The weather entity must provide daily and hourly forecasts.
- HACS is optional. You can also install the card manually.

The card uses inline SVG for its artwork and includes the local SunCalc code it needs. It has no external JavaScript or image dependencies.

## Install with HACS

First, add this public GitHub repository as a custom HACS repository:

1. In Home Assistant, open **HACS**.
2. Open the **⋮** menu and choose **Custom repositories**.
3. Enter `https://github.com/arn0ld2000/arn0ld2000-smhi-card`.
4. Select **Dashboard** as the category and add the repository.
5. Find **arn0ld2000 SMHI Card** in HACS and install it.
6. If HACS does not add the resource automatically, add this resource under **Settings → Dashboards → ⋮ → Resources**:

   ```text
   /hacsfiles/arn0ld2000-smhi-card/arn0ld2000-smhi-card.js
   ```

   Choose **JavaScript Module** as the resource type.
7. Reload the Home Assistant dashboard in your browser or app.
8. Add a **Manual** card and paste a configuration from the examples below.

## Manual installation

1. Copy `arn0ld2000-smhi-card.js` into Home Assistant's `/config/www/` directory. The resulting file should be:

   ```text
   /config/www/arn0ld2000-smhi-card.js
   ```

2. In Home Assistant, open **Settings → Dashboards → ⋮ → Resources** and add:

   ```text
   /local/arn0ld2000-smhi-card.js
   ```

   Select **JavaScript Module** as the resource type.
3. Save the resource and reload the dashboard.
4. Add a **Manual** card and paste one of the YAML examples below.

## Configure the card

### One location

Replace the example entity and coordinates with your own:

```yaml
type: custom:arn0ld2000-smhi-card
name: My location
entity: weather.smhi_my_location
latitude: 58.0
longitude: 11.0
wind_unit: m/s
days: 11
refresh_minutes: 15
stale_minutes: 90
```

### Multiple locations

Use `locations` to enable the location selector in the header. Add one, two, or three locations:

```yaml
type: custom:arn0ld2000-smhi-card
wind_unit: m/s
days: 11
refresh_minutes: 15
stale_minutes: 90
locations:
  - name: Location 1
    entity: weather.smhi_location_1
    latitude: 58.0
    longitude: 11.0
  - name: Location 2
    entity: weather.smhi_location_2
    latitude: 57.0
    longitude: 12.0
  - name: Location 3
    entity: weather.smhi_location_3
    latitude: 56.0
    longitude: 13.0
```

Each location needs a display `name` and a Home Assistant `weather.*` entity. Coordinates are decimal degrees and are used to calculate local sun and moon times. If coordinates are omitted, the card uses the home coordinates configured in Home Assistant.

Find an entity ID in **Developer Tools → States** or in **Settings → Devices & services → Entities**. The SMHI integration must already have created the weather entity; this card does not create weather entities itself.

## Configuration options

| Option | Default | Description |
|---|---:|---|
| `entity` | — | The `weather.*` entity for a single location. Use either this or `locations`. |
| `name` | `Väder` | Display name for a single location. |
| `locations` | — | One to three objects, each with `name`, `entity`, and optional coordinates. Enables the location selector. |
| `latitude` | Home latitude | Decimal latitude for local sun and moon times. |
| `longitude` | Home longitude | Decimal longitude for local sun and moon times. |
| `wind_unit` | `m/s` | Wind display unit: `m/s` or `km/h`. |
| `days` | `11` | Number of daily forecast cards to show, from 1 to 14. The SMHI entity may return fewer days. |
| `refresh_minutes` | `15` | How often the card requests updated forecasts. The minimum is 5 minutes. A manual refresh button is also available. |
| `stale_minutes` | `90` | How long forecast data may go without a successful refresh before the card marks it as stale. This does not change the SMHI update rate. |
| `moon_entity` | `sensor.moon` | Optional Home Assistant moon-phase entity used for the phase name when available. The card calculates illumination and lunar times itself. |

### Optional weather details

The card looks for thunder probability and frozen-precipitation information in the weather entity's attributes or in matching sensor IDs/friendly names. These details are optional. If there are several possible matching sensors, the card may omit the optional value rather than guess which sensor belongs to the selected location.

The frost symbol has two possible meanings depending on available data: when frozen-precipitation data is found, it shows the expected frozen share of precipitation; otherwise, it is a simple indicator based on the day's forecast low temperature. The pressure label (low, normal, or high) and its hPa difference compare the current pressure with standard pressure; they are not a pressure trend over time.

## Using the card

- Select a forecast day to show its hourly forecast below.
- Select **Today** in the header to return to today's hourly forecast.
- Use the location selector to switch between configured places.
- Scroll the daily and hourly forecast strips sideways. On a computer, drag either strip with the mouse.
- Select the temperature to open the weather entity's Home Assistant more-info dialog.
- Select the refresh icon in the header to request forecasts immediately.

## Troubleshooting

### “Custom element doesn't exist”

Check that the JavaScript resource URL is correct, the resource type is **JavaScript Module**, and the card type is exactly `custom:arn0ld2000-smhi-card`. Save the resource, then reload the dashboard. A hard refresh may be needed to clear the browser's cached JavaScript.

### Forecast is missing or shows an error

Check that the configured entity exists and starts with `weather.`. Confirm that the SMHI entity can provide both daily and hourly forecasts. An entity can omit individual fields such as pressure, cloud cover, or gust speed; those values will not appear if the integration does not provide them.

### Sun or moon times are missing

Provide valid decimal coordinates for the selected location, or set the home latitude and longitude in Home Assistant. The card also needs the Home Assistant time zone to be configured correctly for local display times.

### The forecast is marked stale

The stale message means the card has not successfully retrieved that forecast type within `stale_minutes`. Check whether the weather entity still exists and provides that forecast type, and check Home Assistant/browser logs for errors. Increasing `stale_minutes` only changes when the warning appears; it does not make SMHI update more often.

## Development

The readable source is in `src/`. To rebuild the distributable card file from the repository root, run:

```bash
python3 build.py
```

This writes `arn0ld2000-smhi-card.js` in the repository root. Keep `src/LICENSE-SunCalc.txt` in distributions because SunCalc is bundled with the card.

## License

The card source is distributed under the MIT License in [`LICENSE`](LICENSE). The bundled SunCalc code is separately covered by the BSD license in [`src/LICENSE-SunCalc.txt`](src/LICENSE-SunCalc.txt).
