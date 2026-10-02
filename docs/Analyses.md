# Analyses

- **Filter and chart** (`/analyze?tab=filter`): filter by country, period, habitat group or species; site/sample/individual/taxa counts and charts (by family, habitat, period) update live; a list of matching sites links back to the map. Clearing filters returns to all 1,425 BugsCEP sites.
- **Change over time** (`/analyze?tab=time`): pick a species, habitat group or country and see individuals/samples across dated samples, binned by year range (100-1000 years, your choice). Each dated sample gets one age (calendar date, else radiocarbon/radiometric midpoint, else period midpoint); undated samples are excluded and counted separately. Empty bins are dropped and the chart axis is spaced by bin order, not literal years, so one far outlier can't squash the rest. Check a bin's label for its real date range.
- **Habitat mix** (`/analyze?tab=habitat`): for a site (or two, side by side), see the share of beetle individuals per BugsCEP habitat group, per sample and overall. Individuals with no habitat code are shown as their own explicit slice, not dropped.
- **3D view** (`/view3d`): every dated (or undated-but-located) sample as a point in 3D: x/y from site coordinates, height from age (older = higher, BP), colour from dominant habitat. Drag to orbit, scroll to zoom, WASD to fly, click a point to open its record. Samples with no recorded depth sit on a visible floor plane rather than being hidden or given a made-up depth.

Species and site pages link into these analyses, and the analyses link back to the map and species pages.
