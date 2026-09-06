# -*- coding: utf-8 -*-
"""Bundle the current editor and generate the shared macOS/iOS Xcode project."""
from pathlib import Path
import shutil, hashlib, json, sys
root = Path(__file__).resolve().parent
repo = root.parent
web = root / 'Web'
if web.exists(): shutil.rmtree(web)
web.mkdir(exist_ok=True)
asset_types = {'.js','.mjs','.css','.png','.jpg','.jpeg','.webp','.gif','.svg','.woff','.woff2','.ttf','.json'}
for source in (repo/'docs').rglob('*'):
    relative = source.relative_to(repo/'docs')
    if relative.parts[0] in {'live','superpowers'}: continue
    if source.is_symlink(): raise ValueError('Native assets cannot be symlinks')
    if source.is_file() and (source.suffix.lower() in asset_types or relative.as_posix() == 'cover.html'):
        target=web/relative; target.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(source,target)
for source in (repo/'public/live').rglob('*'):
    if source.is_symlink(): raise ValueError('Native assets cannot be symlinks')
    if source.is_file() and source.suffix.lower() in asset_types:
        target=web/'live'/source.relative_to(repo/'public/live');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
html = (web/'cover.html').read_text()
html = html.replace('<head>', '''<head><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; frame-src 'none'">''')
html = html.replace('照片只在当前浏览器处理','照片只在本机处理，成品直接保存相册')
html = html.replace('<button id="copyWorkspaceSwitch"','<button hidden id="copyWorkspaceSwitch"')
# The offline app ships to the owner; website access gate is unchanged in docs/.
html = html.replace('</head>', '<style>#accessGate,.copy-sync{display:none!important}#coverPage{display:block!important}</style></head>')
(web/'cover.html').write_text(html)
js=(web/'cover.js').read_text()
needle='  const isMobile = isMobileExportDevice();\n  const resolutionMessage = describeExportResolution(asset);'
replacement='''  if (window.webkit?.messageHandlers?.nanboLive) {
    if (asset.blob.size > 64 * 1024 * 1024) { setExportStatus("图片超过 64MB，请改用 JPG 导出后保存相册"); return; }
    setExportStatus("正在保存到相册…");
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(asset.blob);
      });
      const result = await window.webkit.messageHandlers.nanboLive.postMessage({action:"image",data});
      setExportStatus(result.saved ? "已保存到相册" : "相册尚未保存");
    } catch { setExportStatus("保存失败，请检查相册权限和可用空间后重试"); }
    return;
  }
''' + needle
if needle not in js: raise RuntimeError('Static image export hook changed; review required')
(web/'cover.js').write_text(js.replace(needle,replacement))

if '--web-only' in sys.argv:
    print('Native web bundle prepared')
    sys.exit(0)

def uid(s): return hashlib.sha1(s.encode()).hexdigest()[:24].upper()
def quote(s): return json.dumps(str(s),ensure_ascii=False)
objects=[]
def obj(name,body):
    objects.append(f'{uid(name)} = {{ {body} }};')
    return uid(name)
sources=[]; files=[]
for file in sorted((root/'Shared').glob('*.swift')):
    ref=obj(str(file.name),f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {quote("Shared/"+file.name)}; sourceTree = "<group>";')
    sources.append(obj('build-'+file.name,f'isa = PBXBuildFile; fileRef = {ref};'))
    files.append(ref)
resource=obj('web', 'isa = PBXFileReference; lastKnownFileType = folder; path = Web; sourceTree = "<group>";')
webbuild=obj('webbuild',f'isa = PBXBuildFile; fileRef = {resource};')
product=obj('product','isa = PBXFileReference; explicitFileType = wrapper.application; path = NanboStudio.app; sourceTree = BUILT_PRODUCTS_DIR;')
group=obj('group',f'isa = PBXGroup; children = ({",".join(files+[resource,uid("products")])}); sourceTree = "<group>";')
obj('products',f'isa = PBXGroup; children = ({product}); name = Products; sourceTree = "<group>";')
srcphase=obj('srcphase',f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({",".join(sources)}); runOnlyForDeploymentPostprocessing = 0;')
resphase=obj('resphase',f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ({webbuild}); runOnlyForDeploymentPostprocessing = 0;')
frameworks=obj('frameworks','isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
for config in ['Debug','Release']:
    obj('project-'+config,f'isa = XCBuildConfiguration; name = {config}; buildSettings = {{ CLANG_ENABLE_MODULES = YES; SWIFT_VERSION = 5.0; }};')
    settings={'PRODUCT_NAME':'NanboStudio','PRODUCT_BUNDLE_IDENTIFIER':'com.nanbostudio.studio','SDKROOT':'auto','SUPPORTED_PLATFORMS':'macosx iphoneos iphonesimulator','MACOSX_DEPLOYMENT_TARGET':'13.0','IPHONEOS_DEPLOYMENT_TARGET':'16.0','TARGETED_DEVICE_FAMILY':'1,2','SUPPORTS_MACCATALYST':'NO','CODE_SIGN_STYLE':'Automatic','GENERATE_INFOPLIST_FILE':'YES','INFOPLIST_KEY_CFBundleDisplayName':'南铂制作','INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription':'点击保存时，将制作的照片或实况照片添加到你的相册。','INFOPLIST_KEY_NSHighResolutionCapable':'YES','INFOPLIST_KEY_UILaunchScreen_Generation':'YES','INFOPLIST_KEY_UIApplicationSceneManifest_Generation':'YES','MARKETING_VERSION':'1.1','CURRENT_PROJECT_VERSION':'2','SWIFT_OPTIMIZATION_LEVEL':'-Onone' if config=='Debug' else '-O','ENABLE_HARDENED_RUNTIME':'YES','COMBINE_HIDPI_IMAGES':'YES','SWIFT_EMIT_LOC_STRINGS':'YES'}
    obj('target-'+config, 'isa = XCBuildConfiguration; name = '+config+'; buildSettings = { '+''.join(f'{k} = {quote(v)};' for k,v in settings.items())+' };')
for prefix in ['project','target']:
    obj(prefix+'-configs',f'isa = XCConfigurationList; buildConfigurations = ({uid(prefix+"-Debug")},{uid(prefix+"-Release")}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
obj('target',f'isa = PBXNativeTarget; buildConfigurationList = {uid("target-configs")}; buildPhases = ({srcphase},{frameworks},{resphase}); buildRules = (); dependencies = (); name = NanboStudio; productName = NanboStudio; productReference = {product}; productType = "com.apple.product-type.application";')
obj('project',f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 1520; }}; buildConfigurationList = {uid("project-configs")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = zh_CN; hasScannedForEncodings = 0; knownRegions = (zh_CN,en,Base); mainGroup = {group}; productRefGroup = {uid("products")}; projectDirPath = ""; projectRoot = ""; targets = ({uid("target")});')
project=root/'NanboStudio.xcodeproj'; project.mkdir(exist_ok=True)
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+'\n}; rootObject = '+uid('project')+'; }\n')
schemes=project/'xcshareddata/xcschemes';schemes.mkdir(parents=True,exist_ok=True)
(schemes/'NanboStudio.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1520" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid('target')}" BuildableName="NanboStudio.app" BlueprintName="NanboStudio" ReferencedContainer="container:NanboStudio.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid('target')}" BuildableName="NanboStudio.app" BlueprintName="NanboStudio" ReferencedContainer="container:NanboStudio.xcodeproj"/></BuildableProductRunnable></LaunchAction><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>''')
print('Native editor and Xcode project prepared')
