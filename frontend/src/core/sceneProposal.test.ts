import { describe, expect, it } from 'vitest'
import { MAX_PROPOSED_OBJECTS, parseSceneProposal, SceneProposalError } from './sceneProposal'

describe('AI scene proposal validation', () => {
  it('converts a valid proposal from cm to mm and resolves the goal', () => {
    const p = parseSceneProposal({
      objects: [
        { type: 'seed_pod_large', xCm: 0, yCm: 30 },
        { type: 'target_zone', xCm: 0, yCm: 60, widthCm: 20 },
        { type: 'color_zone', xCm: -20, yCm: 10, color: 'Blue', widthCm: 12, lengthCm: 8, rotationDeg: 45 },
      ],
      goal: { type: 'object_in_zone', objectType: 'seed_pod_large' },
      assumptions: ['The pod is 30 cm in front of the robot.', 7, ''],
    })
    expect(p.objects.map((o) => o.type)).toEqual(['seed_pod_large', 'target_zone', 'color_zone'])
    expect(p.objects[0]).toMatchObject({ x: 0, y: 300 })
    expect(p.objects[1].r).toBe(100)
    expect(p.objects[2]).toMatchObject({ x: -200, y: 100, w: 120, l: 80, rot: 45, surface: 'blue' })
    expect(p.goal).toEqual({ type: 'object_in_zone', objectId: p.objects[0].id, zoneId: p.objects[1].id })
    expect(p.assumptions).toEqual(['The pod is 30 cm in front of the robot.'])
    expect(p.dropped).toEqual([])
  })

  it('drops unknown object types instead of inventing something', () => {
    const p = parseSceneProposal({ objects: [{ type: 'dragon', xCm: 1, yCm: 1 }, { type: 'ball', xCm: 5, yCm: 5 }, { type: 'cube' }], goal: null, assumptions: [] })
    expect(p.objects.map((o) => o.type)).toEqual(['ball'])
    expect(p.dropped.length).toBe(2)
    expect(p.dropped[0]).toContain('dragon')
  })

  it('throws when the overall shape is wrong', () => {
    expect(() => parseSceneProposal('a mat')).toThrow(SceneProposalError)
    expect(() => parseSceneProposal({ things: [] })).toThrow(SceneProposalError)
    expect(() => parseSceneProposal({ objects: 'many' })).toThrow(SceneProposalError)
  })

  it('resolves robot goals to a finish spot and leaves unresolvable goals empty', () => {
    const park = parseSceneProposal({ objects: [{ type: 'target_zone', xCm: 0, yCm: 20 }, { type: 'finish', xCm: 0, yCm: 50 }], goal: { type: 'robot_in_zone' } })
    expect(park.goal).toEqual({ type: 'robot_in_zone', zoneId: park.objects[1].id })
    const noZone = parseSceneProposal({ objects: [{ type: 'box', xCm: 0, yCm: 30 }], goal: { type: 'object_in_zone', objectType: 'box' } })
    expect(noZone.goal).toBeNull()
    const wrongType = parseSceneProposal({ objects: [{ type: 'box', xCm: 0, yCm: 30 }, { type: 'target_zone', xCm: 0, yCm: 60 }], goal: { type: 'object_in_zone', objectType: 'ball' } })
    expect(wrongType.goal).toBeNull()
    const none = parseSceneProposal({ objects: [{ type: 'finish', xCm: 0, yCm: 30 }], goal: { type: 'none' } })
    expect(none.goal).toBeNull()
    // a wall is not something that can be delivered
    const wall = parseSceneProposal({ objects: [{ type: 'wall', xCm: 0, yCm: 30 }, { type: 'target_zone', xCm: 0, yCm: 60 }], goal: { type: 'object_in_zone', objectType: 'wall' } })
    expect(wall.goal).toBeNull()
  })

  it('clamps positions, sizes and the number of objects', () => {
    const p = parseSceneProposal({ objects: [{ type: 'box', xCm: 99999, yCm: -99999, widthCm: 5000, lengthCm: 0.01 }, { type: 'ball', xCm: 0, yCm: 0, widthCm: 900 }] })
    expect(p.objects[0]).toMatchObject({ x: 3000, y: -3000, w: 2000, l: 10 })
    expect(p.objects[1].r).toBe(400)
    const many = parseSceneProposal({ objects: Array.from({ length: 30 }, (_, i) => ({ type: 'cube', xCm: i, yCm: 0 })) })
    expect(many.objects.length).toBe(MAX_PROPOSED_OBJECTS)
    expect(many.dropped.length).toBe(1)
  })
})
