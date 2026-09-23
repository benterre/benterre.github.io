# SlideControl for the talks

All eleven Reveal decks in this directory register SlideControl alongside their
existing Markdown, Highlight, Notes, Zoom and Search plugins. Nine belong to the
published website tree; two are the Git-ignored `interactive-slides` working
copies. Listings, PDF-only talks, the quiver visualization and the speaker-view
helper are not presentation decks and were not modified.

## Present with a phone, watch or Windows controller

1. Open the presentation on `https://www.benterre.com/talks/.../` after deploying
   these local files. Remote control is disabled initially and opens no socket.
2. Press **F8** to enable it. Enter the private SlideControl owner credential in
   the setup panel at runtime. **Shift+F8** opens setup before presenting.
3. A green dot means the deck authenticated and registered with
   `wss://slidecontrol.benterre.com/ws`. Amber means connecting; red means an error.
4. For a new controller, create a pairing code in setup, enter the eight digits
   in the controller app, and explicitly approve that device in the deck.
5. Close setup before projecting. Select the intended deck in the controller.
   Next/Previous may step fragments; the four arrows retain Reveal semantics.
6. Press **F8** again to disable remote control when finished. Normal slide
   navigation remains available. No movement is queued for later replay.

Do not put owner credentials or device tokens in these public files. Browser
credentials remain in memory. The phone/watch/Windows apps remember their own
approved device credentials; a fresh deck session still needs owner setup.

## Where the integration lives

- Website asset: `dist/slidecontrol.js`, with `dist/slidecontrol.LICENSE.txt`.
- The nine website decks load `../dist/slidecontrol.js` and add the factory to
  the same `Reveal.initialize` plugin list. Existing options and callbacks remain.
- The two standalone interactive copies load `../shared/slidecontrol.js` from
  their own directory tree, so they still need no files outside that tree.
- Coamoeba has a useful controller label in place of its generic HTML title;
  the interactive copies have distinct labels to avoid selecting the wrong tab.

For a new sibling deck, retain the existing plugin scripts and add:

```html
<script src="../dist/slidecontrol.js"></script>
<script>
  Reveal.initialize({
    // Preserve the deck's other existing options.
    plugins: [RevealMarkdown, RevealHighlight, RevealNotes,
              RevealZoom, RevealSearch,
              SlideControl({ endpoint: 'wss://slidecontrol.benterre.com/ws' })]
  });
</script>
```

For an already initialized Reveal instance, use `SlideControl.attach(Reveal, {
endpoint: 'wss://slidecontrol.benterre.com/ws' })` instead of initializing it twice.

## Local previews and interactive copies

The production relay accepts the website's HTTPS origin, not arbitrary local
origins. Double-clicking a file (`file://`) or serving it from
`http://localhost:8000` does not grant production access. Local slides and the
interactive copies' W/D hand controls still work with SlideControl disabled.
For production device testing, use the deployed HTTPS `www.benterre.com` page.
The apex `benterre.com/talks/` was verified to redirect to that canonical host.

The `interactive-slides` directory remains Git-ignored. Its two integrations are
local changes and will not be included by an ordinary Git add/commit/push.
No publishing or ignore-policy change was performed for those prototypes.

The shared script is the tested SlideControl 1.0.0 distribution. The source
project retains the exact-deck verification harness and its results. Verification
separates real authenticated local-relay navigation from production TLS/Origin
and authentication-gate checks; production credentials are never embedded.

## Verification on 23 September 2026

All eleven actual decks passed 126 checks, including 27 remote commands applied
by real Reveal through an authenticated temporary local relay. Existing settings,
plugins, slide/fragment counts and local navigation were preserved. All eleven
also reached the production WSS endpoint from the canonical website origin with
normal TLS validation and received the expected authentication-required response.
No production owner credential was used in this per-deck verification. Physical
controller acceptance on live presentations is the next user check.

There were no page exceptions before or after integration. Five older decks have
an existing missing `../plugin/math/math.js` reference; that unrelated 404 remains
unchanged and did not prevent deck initialization or remote-control tests.
