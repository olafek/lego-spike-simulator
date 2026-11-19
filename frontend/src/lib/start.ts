// Ways to start a project: from screenshots (the main path), from a sample, or empty.

import { api, ApiError } from './api'
import { looksLikeImage, prepareForUpload } from './image'
import { rememberProject } from './recent'
import { newProjectData } from '@/core/project'
import { SAMPLE_SCREENSHOT, type Sample } from '@/core/samples'
import type { SessionInfo } from './api'

export class StartError extends Error {}

function niceDate(): string {
  return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export interface UploadProgress {
  done: number
  total: number
}

/** Create a project and upload the screenshots in order. Returns the project id. */
export async function startFromFiles(files: File[], limits: SessionInfo['limits'] | undefined, onProgress: (p: UploadProgress) => void, name?: string): Promise<string> {
  const maxCount = limits?.maxScreenshotsPerProject ?? 6
  const maxMb = limits?.maxUploadMb ?? 8
  const images = files.filter(looksLikeImage)
  if (images.length === 0) throw new StartError('That does not look like a picture. Use a screenshot of your SPIKE program (PNG or JPG).')
  if (images.length > maxCount) throw new StartError(`That is a lot of pictures! You can use up to ${maxCount} screenshots for one program.`)

  const prepared = []
  for (const f of images) {
    const p = await prepareForUpload(f, limits?.maxImageDimension ?? 4096)
    if (p.blob.size > maxMb * 1024 * 1024) throw new StartError(`"${f.name}" is too big (more than ${maxMb} MB). Try a normal screenshot instead of a photo.`)
    prepared.push(p)
  }

  const project = await api.createProject(name ?? `My program – ${niceDate()}`, newProjectData())
  rememberProject(project.id)
  onProgress({ done: 0, total: prepared.length })
  try {
    for (let i = 0; i < prepared.length; i++) {
      await api.uploadScreenshot(project.id, prepared[i].blob, prepared[i].name)
      onProgress({ done: i + 1, total: prepared.length })
    }
  } catch (e) {
    // do not leave an empty project behind
    await api.deleteProject(project.id).catch(() => undefined)
    throw e instanceof ApiError ? new StartError(e.message) : e
  }
  return project.id
}

export async function startFromSample(sample: Sample): Promise<string> {
  const built = sample.build()
  const project = await api.createProject(built.name, built.data)
  rememberProject(project.id)
  return project.id
}

/** The stored example screenshot goes through exactly the same upload + recognise path as a real one. */
export async function startFromSampleScreenshot(limits: SessionInfo['limits'] | undefined, onProgress: (p: UploadProgress) => void): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}${SAMPLE_SCREENSHOT.url}`)
  if (!res.ok) throw new StartError('The example screenshot is missing.')
  const blob = await res.blob()
  const file = new File([blob], SAMPLE_SCREENSHOT.name, { type: 'image/png' })
  return startFromFiles([file], limits, onProgress, 'Example screenshot')
}

export async function startEmpty(): Promise<string> {
  const project = await api.createProject(`My program – ${niceDate()}`, newProjectData())
  rememberProject(project.id)
  return project.id
}
