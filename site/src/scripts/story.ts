import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const chapterLinks = [...document.querySelectorAll<HTMLAnchorElement>('.site-header nav a')]
const readingProgress = document.querySelector<HTMLElement>('.reading-line > span')
const readout = document.querySelector<HTMLElement>('.layer-readout')
const layerContent = {
  llm: { index: '01', kicker: 'Temporary intelligence', title: 'The call ends.<br />The thinking stops.', copy: 'A model reasons over the context a host gives it, then returns a proposal. It does not own the character, its diary, or the keys.', label: 'OWNS', fact: 'One temporary turn' },
  cat: { index: '02', kicker: 'Persistent character', title: 'The character<br />outlives the call.', copy: 'The host owns identity and persistent state. A new model call can meet the same cat because the host carries the life between turns.', label: 'OWNS', fact: 'Identity and state stay with the host' },
  tail: { index: '03', kicker: 'Reusable continuity', title: 'The useful bits<br />make it through.', copy: 'Ginger Tail supplies bounded cognition, interest transitions, source checks for memory, and decision safeguards. The host still supplies storage and authority.', label: 'SUPPLIES', fact: 'Mechanisms, not a hosted pet' },
}
type Layer = keyof typeof layerContent
function selectLayer(button: HTMLButtonElement) {
  const data = layerContent[button.dataset.layer as Layer]
  if (!data || !readout) return
  document.querySelectorAll<HTMLButtonElement>('.layer-button').forEach(item => item.setAttribute('aria-pressed', String(item === button)))
  const update = () => {
    readout.querySelector('.readout-index')!.textContent = data.index
    readout.querySelector('.readout-kicker')!.textContent = data.kicker
    readout.querySelector('.readout-title')!.innerHTML = data.title
    readout.querySelector('.readout-copy')!.textContent = data.copy
    readout.querySelector('.readout-fact span')!.textContent = data.label
    readout.querySelector('.readout-fact strong')!.textContent = data.fact
  }
  if (reduceMotion.matches) update()
  else gsap.to(readout, { autoAlpha: 0, y: 9, duration: .16, onComplete: () => { update(); gsap.to(readout, { autoAlpha: 1, y: 0, duration: .32, ease: 'power3.out' }) } })
}
document.querySelectorAll<HTMLButtonElement>('.layer-button').forEach(button => button.addEventListener('click', () => selectLayer(button)))

const steps = [...document.querySelectorAll<HTMLElement>('.story-step')]
const stage = document.querySelector<HTMLElement>('.story-stage')
if (!reduceMotion.matches && stage && steps.length) {
  document.documentElement.classList.add('motion-ready')
  steps.forEach((step, index) => ScrollTrigger.create({
    trigger: step, start: 'top 72%', end: 'bottom 28%',
    onEnter: () => stage.dataset.scene = step.dataset.step!,
    onEnterBack: () => stage.dataset.scene = step.dataset.step!,
  }))
}
if (readingProgress) gsap.to(readingProgress, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: .35 } })
chapterLinks.forEach(link => {
  const target = document.querySelector<HTMLElement>(link.hash)
  if (target) ScrollTrigger.create({ trigger: target, start: 'top 35%', end: 'bottom 35%', onEnter: () => setCurrent(link), onEnterBack: () => setCurrent(link) })
})
function setCurrent(current: HTMLAnchorElement) { chapterLinks.forEach(link => link.toggleAttribute('aria-current', link === current)) }
if (chapterLinks[0]) setCurrent(chapterLinks[0])

if (!reduceMotion.matches) {
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
  intro.from('.opening-copy > *', { y: 18, opacity: 0, duration: .7, stagger: .07 }).from('.hero-cat', { x: 24, opacity: 0, duration: .85 }, '-=.55')
  const heroLamp = document.querySelector('.opening-copy .live-dot')
  if (heroLamp) {
    const breathe = gsap.to(heroLamp, { scale: 1.28, opacity: .68, yoyo: true, repeat: -1, duration: 3.2, ease: 'sine.inOut', paused: true })
    ScrollTrigger.create({ trigger: '.opener', start: 'top bottom', end: 'bottom top', onEnter: () => breathe.play(), onEnterBack: () => breathe.play(), onLeave: () => breathe.pause(0), onLeaveBack: () => breathe.pause(0) })
  }
}
