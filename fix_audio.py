import re

with open("frontend/src/hooks/useWebSocket.js", "r") as f:
    content = f.read()

# Fix AudioContext init
content = re.sub(
    r'audioContext\.current = new AudioContextClass\(\{ sampleRate: \d+ \}\);',
    r'audioContext.current = new AudioContextClass();',
    content
)

# Fix Float32 conversion and buffer sample rate
old_float_conv = """      // Convert Int16 to Float32 for Web Audio API
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }
      
      // Create audio buffer (Cartesia streams at 16000 Hz)
      const buffer = ctx.createBuffer(1, float32Data.length, 16000);"""

new_float_conv = """      // Convert Int16 to Float32 for Web Audio API
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
      }
      
      // Create audio buffer (Gemini natively streams at 24000 Hz)
      const buffer = ctx.createBuffer(1, float32Data.length, 24000);"""

content = content.replace(old_float_conv, new_float_conv)

# Wait, what if it was 24000 previously? Let's check both
old_float_conv2 = """      // Convert Int16 to Float32 for Web Audio API
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }
      
      // Create audio buffer (Gemini natively streams at 24000 Hz)
      const buffer = ctx.createBuffer(1, float32Data.length, 24000);"""

content = content.replace(old_float_conv2, new_float_conv)


with open("frontend/src/hooks/useWebSocket.js", "w") as f:
    f.write(content)
