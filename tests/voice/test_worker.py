import unittest, tempfile
from pathlib import Path
from src.voice.worker import synthesize

class WorkerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        base = Path('.build/voice-python-tests'); base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.output = str((Path(self.temp.name) / 'sample.mp3').resolve())

    async def test_selected_voice_and_prosody_produce_a_file(self):
        captured = {}
        class Audio:
            async def save(self, filename): Path(filename).write_bytes(b'ID3' + bytes(64))
        def factory(text, voice, **kw):
            captured.update(text=text, voice=voice, **kw); return Audio()
        await synthesize(dict(text='Hola',voice='es-MX-DaliaNeural',rate=-5,outputPath=self.output), factory)
        self.assertEqual(captured,dict(text='Hola',voice='es-MX-DaliaNeural',rate='-5%',pitch='+0Hz',volume='-10%'))
        self.assertGreater(Path(self.output).stat().st_size,0)

    async def test_invalid_request_never_calls_provider(self):
        def never(*args, **kw): self.fail('Provider called for invalid input')
        for patch in [dict(voice='unknown'),dict(text=''),dict(rate=99),dict(outputPath='../bad.mp3')]:
            request=dict(text='Hola',voice='es-MX-DaliaNeural',rate=-5,outputPath=self.output); request.update(patch)
            with self.assertRaises(ValueError): await synthesize(request, never)

    async def test_existing_file_is_not_overwritten(self):
        Path(self.output).write_bytes(b'existing')
        with self.assertRaises(ValueError):
            await synthesize(dict(text='Hola',voice='es-MX-DaliaNeural',rate=-5,outputPath=self.output), None)
        self.assertEqual(Path(self.output).read_bytes(),b'existing')
