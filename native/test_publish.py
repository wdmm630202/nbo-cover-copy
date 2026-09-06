# -*- coding: utf-8 -*-
import unittest, tempfile, hashlib, json
from pathlib import Path
from publish_updates import publish
class PublishTests(unittest.TestCase):
    def test_deterministic_complete_and_changed_version(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);web=root/'web';web.mkdir();(web/'cover.html').write_text('one')
            out=root/'feed';a=publish(web,out);b=publish(web,out)
            self.assertEqual(a,b)
            m=json.loads((out/'manifest.json').read_text());f=m['files'][0]
            self.assertEqual(hashlib.sha256((out/'versions'/a/f['path']).read_bytes()).hexdigest(),f['sha256'])
            (web/'cover.html').write_text('two');c=publish(web,out)
            self.assertNotEqual(a,c);self.assertEqual((out/'versions'/a/'cover.html').read_text(),'one')
    def test_reject_symlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);web=root/'web';web.mkdir();(web/'bad').symlink_to('/etc/hosts')
            with self.assertRaises(ValueError):publish(web,root/'feed')
if __name__=='__main__':unittest.main()
