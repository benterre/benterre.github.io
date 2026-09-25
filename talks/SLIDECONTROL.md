# SlideControl for the talks

All eleven Reveal decks register SlideControl alongside their existing plugins. Nine are in the published website tree; two are Git-ignored interactive working copies. The integration uses the fixed production service automatically.

## Present with your phone and watch

1. Open the presentation on `https://www.benterre.com/talks/.../` and press **F8** to show setup.
2. On first use, enter your private owner credential. Login is remembered for three days by default. Check **Remember device** to keep it without an automatic expiry, until you forget the browser, clear site data or revoke authorization. Saved login works across decks on this same website origin.
3. After authentication, the green dot indicates a registered presentation. Refreshing or opening another deck reconnects automatically while remembered remote control is enabled.
4. For a new phone, create a pairing code in setup, enter it in phone Settings, and approve the phone in the browser. Existing controller approvals remain valid across presenter refreshes and future presentations.
5. Select the presentation in the phone's bottom navigation bar. The matching Wear companion receives setup and selection from the phone; it has no settings or pairing keyboard. Either device can navigate, and both display browser-authoritative state.
6. **F8** opens or closes the panel without stopping control. Choose **Disable remote control** in the panel when finished. This preserves saved login but prevents automatic reconnection until you enable it again. **Forget this browser** removes its saved login without revoking your approved controllers.

Phone and watch follow a replacement live presentation with the same name when the previously selected instance goes offline. A still-live selection is retained. Gestures preserve Reveal directions; the phone's Next/Previous buttons also traverse fragments. Movements are never queued for later replay.

The private owner credential is stored only in this browser's storage, never in public website files. Other JavaScript running on this same origin can read browser storage, so remember a device only in a browser profile you trust. Clearing website data removes remembrance. The phone/watch share a lower-privilege controller identity; revoking it disconnects both. Windows controllers keep their independent approvals.

## Integration files

- Published shared asset: `dist/slidecontrol.js` and its MIT license.
- Nine website decks load `../dist/slidecontrol.js?v=1.1.0`.
- Two interactive working copies load `../shared/slidecontrol.js?v=1.1.0` within their own directory tree.
- The production service address is built into the shared plugin and is neither shown nor editable in setup.

For a new sibling deck, preserve its existing plugins and add:

```html
<script src="../dist/slidecontrol.js?v=1.1.0"></script>
<script>
  Reveal.initialize({
    plugins: [RevealMarkdown, RevealHighlight, RevealNotes,
              RevealZoom, RevealSearch, SlideControl({})]
  });
</script>
```

For an initialized Reveal instance, use `SlideControl.attach(Reveal)` rather than initializing it twice. Optional `title` gives the controller a useful presentation name.

Production accepts the canonical HTTPS website origin. A file opened directly or a localhost preview cannot authenticate to production. Local slides continue working independently when remote control is disabled. The interactive directory stays Git-ignored and is not published by an ordinary Git push.

## Verification

The SlideControl workspace retains the source, browser/relay regression suite and an exact-deck harness. The harness checks every actual deck against its original Reveal options, slides and fragments, exercises authenticated navigation against an isolated local relay, and checks real production TLS/Origin/authentication gates without reading any production owner credential. Current update results are recorded in the workspace's `docs/COMPANION-UPDATE.md` and `test-results/talks-integration.json`.