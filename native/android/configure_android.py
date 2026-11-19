#!/usr/bin/env python3
"""Configura el proyecto Android generado por Capacitor sin modificar la PWA."""
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parent
app=root/'android'/'app'
java=app/'src/main/java/com/fleboreport/app'
java.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'MainActivity.java',java/'MainActivity.java')
shutil.copyfile(root/'FleboIdScannerPlugin.java',java/'FleboIdScannerPlugin.java')
shutil.copyfile(root/'FleboQrCameraActivity.java',java/'FleboQrCameraActivity.java')
xml=app/'src/main/res/xml'
xml.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'flebo_idscanner_paths.xml',xml/'flebo_idscanner_paths.xml')
# Ícono vectorial monocromático para notificaciones de la barra de Android.
drawables=app/'src/main/res/drawable'
drawables.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'ic_stat_fleboreport.xml',drawables/'ic_stat_fleboreport.xml')
gradle=app/'build.gradle'
s=gradle.read_text()
needle='dependencies {'
assert needle in s,'No se encontró bloque de dependencias'
s=s.replace(needle,needle+"\n    implementation 'androidx.camera:camera-camera2:1.5.2'\n    implementation 'androidx.camera:camera-lifecycle:1.5.2'\n    implementation 'androidx.camera:camera-view:1.5.2'\n    implementation 'com.google.mlkit:barcode-scanning:17.3.0'\n    implementation 'com.google.mlkit:text-recognition:16.0.1'\n    implementation 'com.google.zxing:core:3.5.3'",1)
s=s.replace('versionCode 1','versionCode 12').replace('versionName "1.0"','versionName "2.1"')
gradle.write_text(s)
manifest=app/'src/main/AndroidManifest.xml'
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
tree=ET.parse(manifest)
base=tree.getroot()
ns='{http://schemas.android.com/apk/res/android}'
# Android 13+ requiere aprobación explícita para avisos en la barra de estado.
if not any(x.get(ns+'name')=='android.permission.POST_NOTIFICATIONS' for x in base.findall('uses-permission')):
    base.insert(0,ET.Element('uses-permission',{ns+'name':'android.permission.POST_NOTIFICATIONS'}))
if not any(x.get(ns+'name')=='android.permission.CAMERA' for x in base.findall('uses-permission')):
    base.insert(0,ET.Element('uses-permission',{ns+'name':'android.permission.CAMERA'}))
# Solo para el instalador oficial de APK firmados publicados en GitHub.
if not any(x.get(ns+'name')=='android.permission.REQUEST_INSTALL_PACKAGES' for x in base.findall('uses-permission')):
    base.insert(0,ET.Element('uses-permission',{ns+'name':'android.permission.REQUEST_INSTALL_PACKAGES'}))
application=base.find('application')
assert application is not None
provider=ET.SubElement(application,'provider',{ns+'name':'androidx.core.content.FileProvider',ns+'authorities':'${applicationId}.idscanner.provider',ns+'exported':'false',ns+'grantUriPermissions':'true'})
ET.SubElement(provider,'meta-data',{ns+'name':'android.support.FILE_PROVIDER_PATHS',ns+'resource':'@xml/flebo_idscanner_paths'})
# Solicitar disponibilidad del visor QR de Google Play services en los dispositivos compatibles.
if not any(x.get(ns+'name')=='com.google.mlkit.vision.DEPENDENCIES' for x in application.findall('meta-data')):
    ET.SubElement(application,'meta-data',{ns+'name':'com.google.mlkit.vision.DEPENDENCIES',ns+'value':'barcode_ui'})
if not any(x.get(ns+'name')=='.FleboQrCameraActivity' for x in application.findall('activity')):
    ET.SubElement(application,'activity',{ns+'name':'.FleboQrCameraActivity',ns+'exported':'false',ns+'screenOrientation':'portrait'})
tree.write(manifest,encoding='utf-8',xml_declaration=True)
print('Android 2.1: OCR local con datos parciales y QR de licencia pública; sin guardar fotos')
