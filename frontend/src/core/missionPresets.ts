// Ready-made mission mats. Positions are mm; the robot starts at (0, 0) facing +y.
// Object sizes are the generic approximations from scene.ts.

import { emptyScene, makeObject, type Scene } from './scene'

export interface MissionPreset {
  id: string
  title: string
  emoji: string
  description: string
  build(): Scene
}

export const MISSION_PRESETS: MissionPreset[] = [
  {
    id: 'seed-pod',
    title: 'Seed pod delivery',
    emoji: '🌰',
    description: 'Push the big seed pod into the circle',
    build() {
      // With a fork on Driving Base 1 (reach 64 + 88 mm) a 30 cm drive stops just short of the
      // circle; about 45 cm delivers the pod.
      const zone = makeObject('target_zone', 0, 600)
      const pod = makeObject('seed_pod_large', 0, 300)
      return { ...emptyScene(), objects: [zone, pod], goal: { type: 'object_in_zone', objectId: pod.id, zoneId: zone.id }, description: 'Push the big seed pod into the circle' }
    },
  },
  {
    id: 'finish',
    title: 'Drive to the finish',
    emoji: '🏁',
    description: 'Park the robot on the finish spot',
    build() {
      const finish = makeObject('finish', 0, 500)
      return { ...emptyScene(), objects: [finish], goal: { type: 'robot_in_zone', zoneId: finish.id }, description: 'Park the robot on the finish spot' }
    },
  },
  {
    id: 'line',
    title: 'Stop at the black line',
    emoji: '➖',
    description: 'Drive until the colour sensor sees the line',
    build() {
      const line = { ...makeObject('line', 0, 400), rot: 90 }
      return { ...emptyScene(), objects: [line], description: 'Stop when the colour sensor sees the black line' }
    },
  },
  {
    id: 'crate',
    title: 'Crate delivery',
    emoji: '📦',
    description: 'Turn, then push the crate onto the circle',
    build() {
      const zone = makeObject('target_zone', 300, 650)
      const crate = makeObject('box', 300, 300)
      return { ...emptyScene(), objects: [zone, crate], goal: { type: 'object_in_zone', objectId: crate.id, zoneId: zone.id }, description: 'Push the crate onto the circle' }
    },
  },
  {
    id: 'wall',
    title: 'Wall ahead',
    emoji: '🧱',
    description: 'Use the distance sensor to stop before the wall',
    build() {
      return { ...emptyScene(), objects: [makeObject('wall', 0, 600)], description: 'Stop before the robot hits the wall' }
    },
  },
  {
    id: 'empty',
    title: 'Empty mat',
    emoji: '⬜',
    description: 'Nothing on the floor – just drive',
    build() {
      return emptyScene()
    },
  },
]
