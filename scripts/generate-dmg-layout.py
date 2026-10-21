#!/usr/bin/env python3
"""릴리즈 DMG 창 배치(.DS_Store) 생성

CI 릴리즈는 Tauri의 Finder 배치 단계를 건너뛰므로, 여기서 만든 파일을
DMG 재조립(scripts/repack-macos-dmg.sh) 때 볼륨 루트에 복사한다
값은 로컬 Tauri 빌드에서 Finder가 쓰는 배치(Tauri DMG 기본값)와 같다
앱 이름이나 tauri.macos.conf.json의 bundle.macOS.dmg 설정을 바꾸면 여기도 함께 고치고 다시 생성

사용 (일회용 가상환경):
  python3 -m venv /tmp/dmg-layout
  /tmp/dmg-layout/bin/pip install ds-store==1.3.3 mac-alias==2.2.3
  /tmp/dmg-layout/bin/python scripts/generate-dmg-layout.py src-tauri/dmg-layout.dsstore
"""
import os
import sys

from ds_store import DSStore

APP_NAME = 'DM NOTE.app'
APP_POSITION = (180, 170)
APPLICATIONS_POSITION = (480, 170)

# Finder 좌표는 화면 왼쪽 아래가 원점. 높이 956 화면에서 Tauri 기본 위치(왼쪽 위 10, 60)와 같음
WINDOW_BOUNDS = '{{10, 496}, {660, 400}}'

WINDOW_SETTINGS = {
    'ContainerShowSidebar': False,
    'ShowSidebar': False,
    'ShowStatusBar': False,
    'ShowTabView': True,
    'ShowToolbar': False,
    'WindowBounds': WINDOW_BOUNDS,
}

ICON_VIEW_SETTINGS = {
    'arrangeBy': 'none',
    'backgroundColorBlue': 1.0,
    'backgroundColorGreen': 1.0,
    'backgroundColorRed': 1.0,
    'backgroundType': 0,
    'gridOffsetX': 0.0,
    'gridOffsetY': 0.0,
    'gridSpacing': 100.0,
    'iconSize': 128.0,
    'labelOnBottom': True,
    'showIconPreview': True,
    'showItemInfo': False,
    'textSize': 16.0,
    'viewOptionsVersion': 1,
}


def main():
    if len(sys.argv) != 2:
        sys.exit('사용: generate-dmg-layout.py <출력 경로>')
    output = sys.argv[1]
    if os.path.exists(output):
        os.remove(output)

    with DSStore.open(output, 'w+') as store:
        store['.']['vSrn'] = ('long', 1)
        store['.']['bwsp'] = WINDOW_SETTINGS
        store['.']['icvp'] = ICON_VIEW_SETTINGS
        store[APP_NAME]['Iloc'] = APP_POSITION
        store['Applications']['Iloc'] = APPLICATIONS_POSITION

    print(f'[OK] DMG 창 배치 생성: {output}')


if __name__ == '__main__':
    main()
