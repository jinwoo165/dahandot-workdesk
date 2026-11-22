export const DESKTOP_THEMES=[
 {id:'red',name:'팀잉 레드',dark:false},
 {id:'blue',name:'오션 블루',dark:false},
 {id:'green',name:'포레스트 그린',dark:false},
 {id:'purple',name:'아이리스 퍼플',dark:false},
 {id:'teal',name:'딥 틸',dark:false},
 {id:'amber',name:'앰버',dark:false},
 {id:'charcoal',name:'차콜 다크',dark:true},
];
export const desktopTheme=id=>DESKTOP_THEMES.find(t=>t.id===id)||DESKTOP_THEMES[0];
export const nextDesktopTheme=id=>DESKTOP_THEMES[(DESKTOP_THEMES.findIndex(t=>t.id===desktopTheme(id).id)+1)%DESKTOP_THEMES.length].id;
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
