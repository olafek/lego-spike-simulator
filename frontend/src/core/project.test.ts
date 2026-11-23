import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, newProjectData, parseProjectData, setMat } from './project'

describe('project document', () => {
  it('accepts the competition mat and still reads older projects', () => {
    const d = newProjectData()
    d.scene.mat = 'competition'
    expect(parseProjectData(JSON.parse(JSON.stringify(d))).scene.mat).toBe('competition')
    const old = JSON.parse(JSON.stringify(newProjectData()))
    old.scene.mat = 'classroom'
    expect(parseProjectData(old).scene.mat).toBe('classroom')
  })

  it('gives a competition table the length of a match', () => {
    const d = newProjectData()
    setMat(d, 'competition')
    expect(d.scene.mat).toBe('competition')
    expect(d.settings.maxSeconds).toBe(150)
    const e = newProjectData({ settings: { ...DEFAULT_SETTINGS, maxSeconds: 90 } })
    setMat(e, 'competition')
    expect(e.settings.maxSeconds).toBe(90)
  })

  it('leaves the run limit alone on the other mats', () => {
    const d = newProjectData()
    setMat(d, 'classroom')
    expect(d.settings.maxSeconds).toBe(60)
  })
})
