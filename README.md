# Sign Translator

A webcam sign language translator that runs entirely in your browser. It reads ASL fingerspelling from your hand and your facial expression from your face at the same time, then shows what you spelled and how you said it, e.g. `[ You say "HELLO" happily ]`.

## How it works

- **Hand tracking**: [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) finds 21 points on your hand. Rule-based geometry turns those points into ASL letters (A–Z). J and Z are detected from motion.
- **Face tracking**: [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) blendshapes are mapped to happy, sad, angry, surprised or neutral.
- No video leaves your computer.

## Run it

You need [Node.js](https://nodejs.org).

```bash
node serve.js
```

Then open http://localhost:8771 in Chrome or Edge and click **Start camera**.

## Using it

- Hold a letter for about 0.8s to type it.
- To repeat a letter (the LL in HELLO), relax or drop your hand in between.
- Lower your hand for 1.5s to finish a word.
- Keys: Space finishes a word, Backspace deletes, Esc clears.
- **Speak** reads the sentence aloud, with the voice's tone changed to match your expression.

## Limitations

Letters are recognized with hand-written rules, not a trained model, so similar handshapes (M/N/S/T/E, A/S) get confused. Only fingerspelling is supported, not whole-word signs.

## Credits

ASL handshape drawings: public domain, from [wpclipart](http://www.wpclipart.com/legal.html) via [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:ASL_letters).
