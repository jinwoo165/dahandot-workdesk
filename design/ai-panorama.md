# AI 도시 파노라마

- 생성 방식: 내장 이미지 생성 도구(image_gen), 2026-11-10
- 결과: `src/assets/city-panorama-ai.webp`, 2172×724, WebP
- 내용: 실제 도시를 재현하지 않은 가상의 수변 스카이라인. 사용자 예시는 구도와 분위기를 정하는 참고로만 사용했습니다.
- 출력 이미지의 색상·구도는 그대로 두고 웹 전송을 위해 WebP 형식으로 변환했습니다.
- 재생: 16초 반복(페이드인 8초, 페이드아웃 8초). 30초 보드 갱신·탐색·필터 변경에도 이미지와 애니메이션 시간을 복원합니다. 첫 로드에서는 이미지가 선명한 지점에서 시작하므로 멈춤 설정을 기억한 상태로 접속해도 사진이 보입니다. 동작 줄이기에서는 정적 이미지로 표시합니다.

## 생성 프롬프트

Use case: photorealistic-natural. Asset type: finished panoramic photograph for a very wide, shallow personal work dashboard header, NOT a website mockup. Create one wholly original, fictional modern waterfront city skyline, inspired only by the broad mood of the user's references: an elegant continuous line of contemporary glass towers seen from far across calm blue water, softly glowing windows, clear pale blue and lavender sky with a gentle peach band near the horizon. Bright blue-hour / late-afternoon exposure, luminous and airy, NOT a dark nighttime city. Credible architecture, restrained luxurious atmosphere, exquisite realistic photographic detail. Composition: EXTREME HORIZONTAL PANORAMA, ideally 3072 x 512 pixels (6:1) or wider. Skyline spans the whole width, distant buildings with varied heights and generous breathing room above every rooftop, level horizon, calm water and subtle natural reflections below. Low-rise edges and taller towers distributed gently across the middle, no dominant huge foreground building. All architectural silhouettes should remain legible in an extremely shallow banner. The skyline and waterline must be concentrated around the middle horizontal band so a thinner center crop preserves the scene. Broad 180-degree panoramic photography, no fisheye distortion. Blue-teal glass, light sky, subtle warm window accents harmonious with an ivory and forest-green productivity dashboard. Entirely NEW scene and original buildings; do not reproduce a reference photograph or exact real city. No ships, no military objects, no people close-up, no text, no logos, no watermarks, no frames. Deliver only the panoramic image.

## 검증

- 단위 테스트 29개 통과, Vite 프로덕션 빌드 통과.
- 예시 화면에서 55초 이상 반복 재생 관찰: 페이드 불투명도 약 0~1, 이미지 교체 0회, 재생 시간 초기화 0회.
- 30초 자동 갱신 및 수동 새로고침 후 재생 연속성 확인.
- 멈춤·재생 및 멈춤 설정으로 페이지를 다시 열 때 이미지 표시 확인.
- 1920px 데스크톱과 360px 모바일 레이아웃 확인. 실제 업무 데이터는 검증에 사용하지 않음.
