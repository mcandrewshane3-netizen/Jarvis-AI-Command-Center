---
name: Safari voice playback lifecycle
description: Reliable hands-free TTS sequencing under iPadOS Safari autoplay and speech-synthesis restrictions.
---

Unlock both HTML media and device speech synthesis from the first user gesture, and reuse the gesture-activated audio element for later cloud TTS. Treat playback as complete only after its end event or a bounded, definitive failure; a resolved `play()` call means playback started, not finished.

**Why:** iPadOS Safari can accept microphone capture while independently blocking later audio playback. If hands-free capture follows `play()` resolution, JARVIS starts listening over its own response or silently skips speech.

**How to apply:** Keep microphone restart downstream of the complete cloud-TTS-or-device-fallback promise. Route cloud media errors, blocked autoplay, and bounded stalls through device speech before declaring playback failed.