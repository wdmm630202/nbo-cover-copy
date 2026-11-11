# -*- coding: utf-8 -*-
import unittest, tempfile, hashlib, json
import shutil, subprocess, sys
from html.parser import HTMLParser
from pathlib import Path
from publish_updates import publish


class BundlePage(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.policy = {}
        self.cover_classes = None
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'content-security-policy':
            for directive in attrs['content'].split(';'):
                name, *values = directive.split()
                self.policy[name] = values
        if tag == 'main' and attrs.get('id') == 'coverPage':
            self.cover_classes = attrs.get('class', '').split()


class PublishTests(unittest.TestCase):
    def test_native_bundle_includes_only_local_makeover_frame(self):
        repo = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            native = stage / 'native'
            docs = stage / 'docs'
            native.mkdir()
            (docs / 'makeover').mkdir(parents=True)
            shutil.copyfile(repo / 'native/prepare.py', native / 'prepare.py')
            for filename in ('cover.html', 'cover.js'):
                shutil.copyfile(repo / 'docs' / filename, docs / filename)
            shutil.copyfile(repo / 'public/makeover/index.html', docs / 'makeover/index.html')
            (docs / 'makeover/unrelated.html').write_text('<title>unrelated</title>')
            subprocess.run([sys.executable, str(native / 'prepare.py'), '--web-only'], check=True, capture_output=True)
            web = native / 'Web'
            self.assertEqual({p.relative_to(web).as_posix() for p in web.rglob('*.html')}, {'cover.html', 'makeover/index.html'})
            parent = BundlePage(web / 'cover.html')
            child = BundlePage(web / 'makeover/index.html')
            self.assertEqual(parent.policy['frame-src'], ['nbo://studio/makeover/index.html'])
            self.assertEqual(child.policy['frame-src'], ["'none'"])
            self.assertEqual(parent.policy['connect-src'], ["'self'"])
            self.assertEqual(child.policy['connect-src'], ["'self'"])
            self.assertEqual(parent.policy['object-src'], ["'none'"])
            self.assertEqual(child.policy['object-src'], ["'none'"])
            self.assertIn('cover-page', parent.cover_classes)
            self.assertNotIn('is-hidden', parent.cover_classes)
            self.assertIn('is-hidden', BundlePage(docs / 'cover.html').cover_classes)

    def test_deterministic_complete_and_changed_version(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);web=root/'web';web.mkdir();(web/'cover.html').write_text('one')
            out=root/'feed';a=publish(web,out);b=publish(web,out)
            self.assertEqual(a,b)
            m=json.loads((out/'manifest.json').read_text());f=m['files'][0]
            self.assertEqual(hashlib.sha256((out/'versions'/a/f['path']).read_bytes()).hexdigest(),f['sha256'])
            (web/'cover.html').write_text('two');c=publish(web,out)
            self.assertNotEqual(a,c);self.assertEqual((out/'versions'/a/'cover.html').read_text(),'one')
    def test_current_cards_require_4k_poster_bridge(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);web=root/'web';(web/'live').mkdir(parents=True)
            (web/'cover.html').write_text('cards')
            (web/'live/card-series.js').write_text('export const CARD_DURATION=2;')
            publish(web,root/'feed')
            self.assertEqual(json.loads((root/'feed/manifest.json').read_text())['bridgeVersion'],3)
    def test_reject_symlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);web=root/'web';web.mkdir();(web/'bad').symlink_to('/etc/hosts')
            with self.assertRaises(ValueError):publish(web,root/'feed')
if __name__=='__main__':unittest.main()
