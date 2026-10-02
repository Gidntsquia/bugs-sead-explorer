# Time Machine

Page: `/timemachine?site=SITE…`. Pick a dated site. A tinted headline answers "warmer or colder than today?" ("3 °C colder than today", "Summers like Tromsø today"). A strip shows one bar per dated sample, tinted by that sample's own temperature estimate (gaps stay empty; "warmest"/"coldest" jump to those samples); a slider snaps to the dates in the data. Below, the beetles in that slice sit in four columns: Cold-loving (<12 °C), Mild (12-16 °C), Warm-loving (>16 °C) by the beetle's summer midpoint, and No temperature data. Faded tiles no longer live near the site. Needs 5+ MCR species for a temperature; otherwise the headline names the biggest column. Indicative only: MCR covers 436 of 11,420 taxa.

## "Today"

"Today" is the 1991-2020 July mean at the site's coordinates, fetched once per site from the Open-Meteo archive (ERA5) and cached in `data/cache/openmeteo/`. Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0, non-commercial use). No coordinates or no network → no number, and the headline falls back to the biggest column.

## Comparison places

July mean °C, approximate normals: Longyearbyen 6, Nuuk 8, Reykjavík 11, Tromsø 12, Anchorage 15, Edinburgh 15, Oslo 17, Helsinki 18, London 19, Moscow 19, Toronto 22, Madrid 25, Beijing 27, Cairo 29, Dubai 34. The nearest to the estimate wins (tie → colder).
