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
xml=app/'src/main/res/xml'
xml.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'flebo_idscanner_paths.xml',xml/'flebo_idscanner_paths.xml')
gradle=app/'build.gradle'
s=gradle.read_text()
needle='dependencies {'
assert needle in s,'No se encontró bloque de dependencias'
s=s.replace(needle,needle+"\n    implementation 'com.google.mlkit:text-recognition:16.0.1'\n    implementation 'androidx.exifinterface:exifinterface:1.3.7'",1)
gradle.write_text(s)
manifest=app/'src/main/AndroidManifest.xml'
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
tree=ET.parse(manifest)
base=tree.getroot()
ns='{http://schemas.android.com/apk/res/android}'
if not any(x.get(ns+'name')=='android.permission.CAMERA' for x in base.findall('uses-permission')):
    base.insert(0,ET.Element('uses-permission',{ns+'name':'android.permission.CAMERA'}))
application=base.find('application')
assert application is not None
provider=ET.SubElement(application,'provider',{ns+'name':'androidx.core.content.FileProvider',ns+'authorities':'${applicationId}.idscanner.provider',ns+'exported':'false',ns+'grantUriPermissions':'true'})
ET.SubElement(provider,'meta-data',{ns+'name':'android.support.FILE_PROVIDER_PATHS',ns+'resource':'@xml/flebo_idscanner_paths'})
tree.write(manifest,encoding='utf-8',xml_declaration=True)
print('Android configurado con plugin ML Kit')
