#!/usr/bin/env python3
"""Configura el proyecto Android generado por Capacitor sin modificar la PWA."""
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parent
app=root.parents[1]/'android'/'app'
if not (app/'build.gradle').is_file():
    raise SystemExit('No existe android/app/build.gradle: ejecuta primero npx cap add android y npx cap sync android')
java=app/'src/main/java/com/fleboreport/app'
java.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'MainActivity.java',java/'MainActivity.java')
shutil.copyfile(root/'FleboIdScannerPlugin.java',java/'FleboIdScannerPlugin.java')
shutil.copyfile(root/'TalcsysDownloadsPlugin.java',java/'TalcsysDownloadsPlugin.java')
shutil.copyfile(root/'TalcsysPrivateFileProvider.java',java/'TalcsysPrivateFileProvider.java')
shutil.copyfile(root/'FleboHomeVisitReminderReceiver.java',java/'FleboHomeVisitReminderReceiver.java')
shutil.copyfile(root/'FleboQrCameraActivity.java',java/'FleboQrCameraActivity.java')
xml=app/'src/main/res/xml'
xml.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'flebo_idscanner_paths.xml',xml/'flebo_idscanner_paths.xml')
# Ícono vectorial monocromático para notificaciones de la barra de Android.
drawables=app/'src/main/res/drawable'
drawables.mkdir(parents=True,exist_ok=True)
icons = root.parents[1] / 'icons'
resources = app / 'src/main/res'
raster = resources / 'drawable-nodpi'
raster.mkdir(exist_ok=True)
shutil.copyfile(icons / 'talcsys-badge.png', raster / 'ic_stat_fleboreport.png')
shutil.copyfile(icons / 'icon-512.png', raster / 'talcsys_launcher.png')
# Android muestra los dos tercios centrales de una capa adaptable.
shutil.copyfile(icons / 'icon-maskable-512.png', raster / 'talcsys_foreground.png')
adaptive = resources / 'drawable-v26'
adaptive.mkdir(exist_ok=True)
(adaptive / 'talcsys_launcher.xml').write_text(
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">'
    '<background android:drawable="@android:color/white"/>'
    '<foreground><inset android:inset="16.67%" android:drawable="@drawable/talcsys_foreground"/></foreground>'
    '</adaptive-icon>'
)
gradle=app/'build.gradle'
s=gradle.read_text()
needle='dependencies {'
assert needle in s,'No se encontró bloque de dependencias'
s=s.replace(needle,needle+"\n    implementation 'androidx.camera:camera-camera2:1.5.2'\n    implementation 'androidx.camera:camera-lifecycle:1.5.2'\n    implementation 'androidx.camera:camera-view:1.5.2'\n    implementation 'com.google.mlkit:barcode-scanning:17.3.0'\n    implementation 'com.google.zxing:core:3.5.3'",1)
s=s.replace('versionCode 1','versionCode 23').replace('versionName "1.0"','versionName "2.12"')
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
for attribute in ('icon', 'roundIcon'):
    application.set(ns + attribute, '@drawable/talcsys_launcher')
provider=ET.SubElement(application,'provider',{ns+'name':'.TalcsysPrivateFileProvider',ns+'authorities':'${applicationId}.talcsys.privateprovider',ns+'exported':'false',ns+'grantUriPermissions':'true'})
ET.SubElement(provider,'meta-data',{ns+'name':'android.support.FILE_PROVIDER_PATHS',ns+'resource':'@xml/flebo_idscanner_paths'})
# Solicitar disponibilidad del visor QR de Google Play services en los dispositivos compatibles.
if not any(x.get(ns+'name')=='com.google.mlkit.vision.DEPENDENCIES' for x in application.findall('meta-data')):
    ET.SubElement(application,'meta-data',{ns+'name':'com.google.mlkit.vision.DEPENDENCIES',ns+'value':'barcode_ui'})
if not any(x.get(ns+'name')=='.FleboQrCameraActivity' for x in application.findall('activity')):
    ET.SubElement(application,'activity',{ns+'name':'.FleboQrCameraActivity',ns+'exported':'false',ns+'screenOrientation':'portrait'})
# Alertas de salida sin WebView abierto; permiso de reinicio no es un permiso de datos.
if not any(x.get(ns+'name')=='android.permission.RECEIVE_BOOT_COMPLETED' for x in base.findall('uses-permission')):
    base.insert(0,ET.Element('uses-permission',{ns+'name':'android.permission.RECEIVE_BOOT_COMPLETED'}))
if not any(x.get(ns+'name')=='.FleboHomeVisitReminderReceiver' for x in application.findall('receiver')):
    receiver=ET.SubElement(application,'receiver',{
        ns+'name':'.FleboHomeVisitReminderReceiver',ns+'exported':'false'})
    action_filter=ET.SubElement(receiver,'intent-filter')
    ET.SubElement(action_filter,'action',{ns+'name':'android.intent.action.BOOT_COMPLETED'})
    ET.SubElement(action_filter,'action',{ns+'name':'android.intent.action.MY_PACKAGE_REPLACED'})
tree.write(manifest,encoding='utf-8',xml_declaration=True)
print('TALCSYS Lab Android 2.12 configurado')
