// Food Fight first-time tutorial: the lessons. Each one loads a small prepared Classic board, points at the one
// move that works, and waits for the player to make it. The UI that runs them lives in app.js (startTutorial).
// Grids are 12 rows of 6, top to bottom: 0 tomato, 1 cheese, 2 donut, 3 avocado, 4 grapes, '.' empty.
(function(root){
  'use strict';
  const E=s=>'......'.repeat(12-s.length)+s.join('');
  const hasTrash=B=>B.g.some(row=>row.some(t=>t&&t.t<0));
  const LESSONS=[
    {key:'match',head:'Make a match',
     text:'Swipe a food sideways to line up 3 of the same. Try the glowing avocado.',
     grid:E(['241231','003014']),hint:{from:[11,2],to:[11,3]},
     goal:B=>B.score>0},
    {key:'vertical',head:'Up and down too',
     text:'Foods swap up and down as well. Swipe the glowing donut up.',
     grid:E(['224130','302413']),hint:{from:[11,2],to:[10,2]},
     goal:B=>B.score>0},
    {key:'chain',head:'Chain reaction',
     text:'When food falls into a new match, that’s a chain, and chains earn trash to throw. Swipe the glowing donut.',
     grid:E(['..1...','..411.','002032']),hint:{from:[11,2],to:[11,3]},
     goal:B=>B.maxChain>=2&&B.rack.length>0},
    {key:'throw',head:'Throw it!',
     text:rival=>`Your chain earned trash. Tap it in your tray to throw it at ${rival}.`,
     tray:true,goal:B=>(B.thrown||0)>0},
    {key:'trash',head:'Trash!',
     text:'Your rival threw trash at you. Make a match touching it to turn it back into food.',
     grid:E(['331324','240101']),junk:3,hint:{from:[10,2],to:[10,3]},
     goal:B=>!hasTrash(B)&&B.score>0},
    {key:'raise',head:'Raise',
     text:'Running low? Hold Raise to push up more food from below.',
     textDesk:'Running low? Hold Raise (or Shift) to push up more food from below.',
     grid:E(['142031']),raise:2,
     goal:B=>(B.raised||0)>=2},
    {key:'top',head:'Keep it off the top',
     text:'This is getting close! If your food reaches the top, you’re out. Last cook standing wins.',
     grid:E(Array.from({length:9},(_,r)=>Array.from({length:6},(_,c)=>(r+c*2)%5).join(''))),
     info:'Let’s cook!'},
  ];
  root.FFTutorial={LESSONS,hasTrash};
})(typeof window!=='undefined'?window:globalThis);
