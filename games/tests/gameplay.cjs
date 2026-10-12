// Run with PLAYWRIGHT_MODULE set to an installed Playwright package.
// The local server injects test hooks; shipped game files have none.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.GAME_QA_OUTPUT||path.join(require('os').tmpdir(),'vatar-gameplay');
fs.mkdirSync(out,{recursive:true});
const hooks={archery:`window.qa={s:()=>({aiming,paused,arrowsShot,gameTime,scores:roundScores,flight:!!flight,audio:audio?.state}),pause:()=>vg._pauseHandlers.forEach(f=>f()),resume:()=>vg._resumeHandlers.forEach(f=>f()),scoreForDistance,startRound,perfect:()=>{wind={speed:0,dir:1};aimX=aimY=0;power=.6;shoot();},stopDraw:()=>cancelAnimationFrame(holdRAF),reject:()=>vg.submitScore=()=>Promise.reject({code:'too_soon'})};`,color:`window.qa={s:()=>({state,round,paused,stateTimer,bots:bots.length,car:{...car},joy:{...joyDir},usedContinueThisRun}),pause:()=>vg._pauseHandlers.forEach(f=>f()),resume:()=>vg._resumeHandlers.forEach(f=>f()),stop:()=>{cancelAnimationFrame(frameId);frameId=null;},step,render,newRun,place:(safe=true)=>{const t=tiles.find(t=>(t.colorIndex===targetColorIndex)===safe);car.x=t.col*TILE+TILE/2;car.y=t.row*TILE+TILE/2;car.vx=car.vy=0;},drop:()=>{state='drop';stateTimer=0;},edge:()=>car.x=-1,brake:()=>car.vx=100,paint:()=>{owned.premium_car_pack=true;renderShop();},grids:()=>{for(let r=1;r<=60;r++){const g=newRoundTiles(r);if(!g.tiles.some(t=>t.colorIndex===g.target))return false;}return true;}};`};
hooks.color += `window.qa.dropped=()=>tiles.filter(t=>t.colorIndex!==targetColorIndex).every(t=>t.fallT===1);`;
const server=http.createServer((req,res)=>{let f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!fs.existsSync(f))return res.writeHead(404).end();let b=fs.readFileSync(f);if(f.endsWith('index.html')&&(f.includes('archery')||f.includes('color-rush')))b=Buffer.from(b.toString().replace('})().catch(err',hooks[f.includes('archery')?'archery':'color']+'\n})().catch(err'));res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(b);});
let browser;const passed=[];function check(name,ok){assert.ok(ok,name);passed.push(name);console.log('PASS',name);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,channel:process.env.GAME_QA_BROWSER||'msedge'});
 const page=await browser.newPage({viewport:{width:375,height:812},deviceScaleFactor:2,hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/games/archery/');await page.waitForFunction(()=>window.qa);
 check('Real SDK loads standalone',await page.evaluate(()=>typeof Vatar.init==='function'));
 check('Audio locked before input',!(await page.evaluate(()=>qa.s())).audio);
 check('Ring centre, boundaries and miss score correctly',await page.evaluate(()=>[0,14.9,15,149,150,150.1].map(d=>qa.scoreForDistance(d,150)).join()==='10,10,9,1,1,0'));
 await page.screenshot({path:path.join(out,'archery.png')});
 await page.mouse.move(185,540);await page.mouse.down();await page.waitForTimeout(300);await page.dispatchEvent('#scene','pointercancel',{pointerId:1});await page.mouse.up();
 check('Cancelled touch does not shoot',(await page.evaluate(()=>qa.s())).arrowsShot===0);
 await page.mouse.down();await page.waitForTimeout(120);await page.evaluate(()=>qa.stopDraw());await page.waitForTimeout(2900);await page.mouse.up();
 check('Auto-release works without draw RAF',(await page.evaluate(()=>qa.s())).arrowsShot===1);
 await page.evaluate(()=>{qa.startRound(0);qa.perfect();qa.pause();});let frozen=await page.evaluate(()=>qa.s());await page.waitForTimeout(800);
 check('SDK pause freezes flight',JSON.stringify(await page.evaluate(()=>qa.s()))===JSON.stringify(frozen));
 await page.evaluate(()=>qa.resume());await page.waitForTimeout(700);check('Flight lands once on resume',(await page.evaluate(()=>qa.s())).scores.join()==='10');
 await page.evaluate(()=>{qa.reject();qa.perfect();});await page.waitForTimeout(650);await page.evaluate(()=>qa.perfect());await page.waitForTimeout(1600);
 check('Rate limit does not block round result',await page.locator('#round-end').evaluate(el=>el.classList.contains('open')));
 check('Perfect round is 30 points',(await page.locator('#round-end-sub').textContent()).includes('30/30'));
 await page.screenshot({path:path.join(out,'archery-result.png')});await page.getByRole('button',{name:'Next: Novice'}).click();
 check('Ladder advances and resets shots',(await page.evaluate(()=>qa.s())).arrowsShot===0);
 await page.getByRole('button',{name:'Shop',exact:true}).click();check('Shop pauses archery',(await page.evaluate(()=>qa.s())).paused);await page.locator('#shop-overlay [data-close]').click();
 await page.goto(base+'/games/color-rush/');await page.waitForFunction(()=>window.qa);
 check('Color Rush waits for Start',await page.locator('#start-overlay').evaluate(el=>el.classList.contains('open')));
 await page.getByRole('button',{name:'With 3 bots'}).click();check('Four drivers maximum',(await page.evaluate(()=>qa.s())).bots===3);
 await page.waitForTimeout(1100);check('Colour cue persists',await page.locator('#announce').evaluate(el=>el.classList.contains('show')));await page.screenshot({path:path.join(out,'color-rush.png')});
 const joy=await page.locator('#joystick-base').boundingBox();await page.mouse.move(joy.x+joy.width/2,joy.y+joy.height/2);await page.mouse.down();await page.mouse.move(joy.x+joy.width-10,joy.y+joy.height/2);await page.waitForTimeout(180);await page.mouse.up();check('Joystick release clears input',(await page.evaluate(()=>qa.s())).joy.x===0);
 await page.evaluate(()=>qa.pause());frozen=await page.evaluate(()=>qa.s());await page.waitForTimeout(500);check('SDK pause freezes cars and countdown',JSON.stringify(frozen)===JSON.stringify(await page.evaluate(()=>qa.s())));await page.evaluate(()=>qa.resume());
 await page.getByRole('button',{name:'Pause',exact:true}).click();check('Manual pause has resume button',await page.getByRole('button',{name:'Keep driving'}).isVisible());await page.getByRole('button',{name:'Keep driving'}).click();
 check('60 generated rounds have safe tiles',await page.evaluate(()=>qa.grids()));
 await page.evaluate(()=>qa.newRun(false));await page.evaluate(()=>qa.stop());
 await page.evaluate(()=>{qa.place();qa.brake();for(let i=0;i<60;i++)qa.step(1/120);});check('Release brakes momentum',Math.abs((await page.evaluate(()=>qa.s())).car.vx)<1);
 await page.evaluate(()=>{qa.place();qa.drop();for(let i=0;i<260;i++)qa.step(1/120);});check('Safe tile advances round',(await page.evaluate(()=>qa.s())).round===2);
 await page.evaluate(()=>{qa.place(false);qa.drop();for(let i=0;i<110;i++)qa.step(1/120);qa.render();});check('Wrong tile ends run',(await page.evaluate(()=>qa.s())).state==='gameover');
 check('Free replay visible',await page.getByRole('button',{name:'Play again · free'}).isVisible());await page.screenshot({path:path.join(out,'color-rush-result.png')});
  check('Floor completes drop after player falls',await page.evaluate(()=>qa.dropped()));
 await page.getByRole('button',{name:'Continue — ₦100'}).click();check('Dev continue retries failed round without scoring it',await page.evaluate(()=>qa.s().round===2&&qa.s().usedContinueThisRun));
 await page.evaluate(()=>{qa.stop();qa.edge();for(let i=0;i<100;i++)qa.step(1/120);});check('Edge fall ends run; only one continue',(await page.evaluate(()=>qa.s())).state==='gameover'&&!(await page.locator('#continue-btn').isVisible()));
 await page.getByRole('button',{name:'Play again · free'}).click();check('Replay resets run',await page.evaluate(()=>qa.s().round===1&&!qa.s().usedContinueThisRun));
 await page.getByRole('button',{name:'Shop',exact:true}).click();await page.evaluate(()=>qa.paint());check('Five additional premium paints',await page.locator('.paint-choice').count()===6);await page.locator('.paint-choice').nth(3).click();await page.locator('#shop-overlay [data-close]').click();
 for(const width of [320,375,430]){await page.setViewportSize({width,height:width===320?568:812});check(`Fits ${width}px phone`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#joystick-base').getBoundingClientRect().bottom<=innerHeight));}
 check('No browser errors',errors.length===0);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed,errors},null,2));console.log('Passed',passed.length,'checks. Screenshots:',out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
