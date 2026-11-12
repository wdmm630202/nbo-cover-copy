"""Produce a complete local workbench with only Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo
import sys
root = Path(__file__).resolve().parent.parent
launcher = '''#!/bin/bash
cd "$(dirname "$0")" || exit 1
exec /usr/bin/env python3 start.py
'''
server = '''from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, webbrowser
os.chdir(Path(__file__).resolve().parent)
server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
url = f"http://127.0.0.1:{server.server_port}/cover.html?mode=makeover"
print("本地离线制作台：", url, "关闭此窗口即停止。")
webbrowser.open(url)
server.serve_forever()
'''
readme = '''南铂制作台离线版

素人改造：直接双击「南铂素人改造离线版.html」，无需网络、服务器或安装依赖。
完整工作台（封面制作/素人改造/Live）：解压后双击「启动制作台.command」。本机需要 Python 3；只监听本机 127.0.0.1，不访问外网。
若 macOS 阻止脚本，右键打开；或在终端进入此文件夹执行 python3 start.py。
完整工作台沿用原访问密码。照片由你重新选择，不包含客户照片。
智能文案需要网络。浏览器缓存清除不会影响此离线包；请保留整个文件夹。
PNG 原片细节无损导出，JPG 最高质量，不限19.9MB，仍受本机内存和浏览器画布能力限制。
'''
output = root/'docs/南铂制作台离线版.zip'
with ZipFile(output, 'w', ZIP_DEFLATED) as z:
    for name in sys.argv[1:] + ['studio-sw.js']:
        z.write(root/'docs'/name, '南铂制作台离线版/'+name)
    for name, content in [('启动制作台.command',launcher),('start.py',server),('使用说明.txt',readme)]:
        info=ZipInfo('南铂制作台离线版/'+name)
        info.external_attr=((0o755 if name.endswith('.command') else 0o644) | 0o100000) << 16
        z.writestr(info, content.encode('utf-8'))
(root/'outputs/南铂制作台离线版.zip').write_bytes(output.read_bytes())
