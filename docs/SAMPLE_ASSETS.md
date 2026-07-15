# Fictional sample asset provenance

Keepscape's public judge fixtures do not publish a real family's private archive. Their photorealistic source
images were created with OpenAI's built-in image generation during Build Week and are labeled in every source
card as **AI-generated fictional demo photo**. They contain no intended likeness of a real person or real family
history.

## Files used by the product

- `public/samples/night-market-source-photo.webp` — central night-market view.
- `public/samples/night-market-left-view.webp` — camera advanced and angled toward the left stall.
- `public/samples/night-market-right-view.webp` — reverse oblique view from the right stall.
- `public/samples/repair-bench-source-photo.webp` — fictional late-1990s home repair bench.

All four checked-in derivatives are 1440×960 WebP files. The three night-market views are separate source
planes in the walkable sample; they are not presented as a scan or recovered geometry.

## Final prompt set

The central night-market image requested a photorealistic fictional 1998 archive view of a narrow blue-hour
market lane with exactly three distinct paper lanterns: a red-and-cream painted lantern on the left, a red
tasseled lantern in the center, and a pale ivory lantern on the right. It specified 35mm film grain, no visible
faces, bicycle, ticket, extra lanterns, text, logos, or watermark.

The two additional views used the central image as a visual reference:

1. A second photograph from several meters farther forward and angled about 25 degrees toward the left produce
   stall, preserving the same wet lane, awnings, light, and three distinctive lanterns with natural perspective.
2. A third photograph from near the right produce stall looking diagonally toward the entrance, making the pale
   ivory lantern and nearby stall more prominent while keeping the other two lanterns plausibly visible.

The repair image requested a photorealistic fictional late-1990s home workshop with an upside-down old bicycle
occupying the left two-thirds, a visible handlebar bell, and a small wrench at lower right; it excluded people,
brands, readable text, and watermarks.

Each prompt explicitly described a fictional demonstration archive. Labels are added by the application rather
than baked into the images so exact source-region overlays remain readable.
