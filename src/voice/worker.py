"""Narrow, standalone speech helper. No API keys and no private text in logs."""
import asyncio
import json
import sys
from pathlib import Path

async def synthesize(request, communicator_factory):
    if not isinstance(request, dict): raise ValueError('INVALID_REQUEST')
    text, voice, rate = request.get('text'), request.get('voice'), request.get('rate')
    target = request.get('outputPath')
    if not isinstance(text, str) or not text.strip() or len(text) > 20000: raise ValueError('INVALID_REQUEST')
    if voice not in ('es-MX-DaliaNeural', 'es-CL-CatalinaNeural'): raise ValueError('INVALID_REQUEST')
    if type(rate) is not int or not -50 <= rate <= 50: raise ValueError('INVALID_REQUEST')
    if not isinstance(target, str): raise ValueError('INVALID_REQUEST')
    output = Path(target)
    if not output.is_absolute() or output.suffix != '.mp3' or output.exists() or not output.parent.is_dir(): raise ValueError('INVALID_REQUEST')
    communication = communicator_factory(text.strip(), voice, rate=f'{rate:+d}%', pitch='+0Hz', volume='-10%')
    await communication.save(str(output))
    if not output.exists() or output.stat().st_size < 32: raise ValueError('NO_AUDIO')
    return dict(ok=True, path=str(output))

def main():
    try:
        from edge_tts import Communicate
        raw = sys.stdin.buffer.read(131073)
        if len(raw) > 131072: raise ValueError('INVALID_REQUEST')
        request = json.loads(raw.decode('utf-8'))
        result = asyncio.run(asyncio.wait_for(synthesize(request, Communicate), timeout=55))
        print(json.dumps(result), flush=True)
        return 0
    except Exception:
        print(json.dumps(dict(ok=False, code='NO_AUDIO')), flush=True)
        return 1

if __name__ == '__main__':
    sys.exit(main())
