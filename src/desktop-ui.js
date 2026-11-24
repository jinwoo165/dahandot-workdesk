export const DESKTOP_THEMES=[
 {id:'red',name:'팀잉 레드',dark:false,swatch:'#b7132b'},
 {id:'blue',name:'오션 블루',dark:false,swatch:'#225a9e'},
 {id:'green',name:'포레스트 그린',dark:false,swatch:'#286346'},
 {id:'purple',name:'아이리스 퍼플',dark:false,swatch:'#7043a1'},
 {id:'teal',name:'딥 틸',dark:false,swatch:'#176968'},
 {id:'amber',name:'앰버',dark:false,swatch:'#8b5917'},
 {id:'charcoal',name:'차콜 다크',dark:true,swatch:'#242427'},
];
export const desktopTheme=id=>DESKTOP_THEMES.find(t=>t.id===id)||DESKTOP_THEMES[0];
export const nextDesktopTheme=id=>DESKTOP_THEMES[(DESKTOP_THEMES.findIndex(t=>t.id===desktopTheme(id).id)+1)%DESKTOP_THEMES.length].id;
export function desktopThemePicker(selected){
 const theme=desktopTheme(selected);
 return `<details id="desktopThemeMenu" class="desktop-dropdown desktop-theme-menu"><summary aria-label="화면 색상 선택 · ${theme.name}" title="화면 색상 선택"><span class="theme-swatch" aria-hidden="true"></span><span class="theme-label">${theme.name}</span><span class="dropdown-caret" aria-hidden="true">⌄</span></summary><div class="desktop-dropdown-panel theme-options" role="group" aria-label="화면 색상">${DESKTOP_THEMES.map(t=>`<button type="button" data-desktop-theme="${t.id}" aria-pressed="${theme.id===t.id}"><span class="palette-swatch" style="--swatch:${t.swatch}" aria-hidden="true"></span><span>${t.name}</span></button>`).join('')}</div></details>`;
}
export function desktopSettingsMenu(){
 return `<details id="desktopSettingsMenu" class="desktop-dropdown desktop-settings-menu"><summary class="settings-trigger" aria-label="설정 메뉴" title="설정"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3-.5 2-1.7 1-2-.6-2.5 4.2 1.5 1.4v2L2.8 14.4l2.5 4.2 2-.6 1.7 1 .5 2h5l.5-2 1.7-1 2 .6 2.5-4.2-1.5-1.4v-2l1.5-1.4-2.5-4.2-2 .6-1.7-1-.5-2z"/><circle cx="12" cy="12" r="3"/></svg></summary><div class="desktop-dropdown-panel account-settings"><button type="button" data-password>비밀번호 설정</button><button type="button" data-help>연결 · 사용 안내</button><button type="button" data-logout>로그아웃</button></div></details>`;
}
export function categoryIcon(kind,today){
 const paths={
  conversation:'<path d="M20 11a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 1 1 17-4Z"/><path d="M7 10h9M7 14h6"/>',
  work:'<rect x="5" y="4" width="15" height="17" rx="3"/><path d="M9 3h7v4H9zM8 12l1 1 2-2M13 12h4M8 17l1 1 2-2M13 17h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="17" rx="3"/><path d="M7 2v6M17 2v6M3 10h18"/>',
  links:'<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(0 0) scale(.92)"/>',
  archived:'<path d="M5 9v12h14V9M9 13h6"/><rect x="3" y="3" width="18" height="6" rx="2"/>',
 };
 const date=Number(String(today).slice(-2));
 return `<svg class="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]||paths.work}${kind==='calendar'?`<text x="12" y="18.7" text-anchor="middle" fill="currentColor" stroke="none" font-size="8.5" font-weight="750">${date>=1&&date<=31?date:''}</text>`:''}</svg>`;
}
