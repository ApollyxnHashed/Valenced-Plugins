# Infinite GIFs

Keeps loading new GIFs as you scroll the native GIF picker, instead of stopping at the first page.

- Works with Discord's built-in provider (Klipy) and with the **GIF Providers** plugin (Tenor, Giphy, Klipy).
- Every provider keeps its own cursor, results stay in one interleaved list and duplicates are skipped.
- With GIF Providers the list keeps growing as long as Tenor or Giphy have results. Without it, only Klipy is used and Discord's server returns at most 100 GIFs per search, so the list grows from 50 to 100.
- No settings. A notice is shown each time the plugin is turned on (not when Discord restarts).

GIF Providers is made by Palm, Livie and Benjii.
