// worker.ts 가 띄우는 스레드 본체. 모델을 한 번 불러와 메시지마다 한 턴씩 분류한다(순서대로).
import { parentPort, workerData } from 'node:worker_threads'
import { ContextClassifier, InputInvalidError, type ClassifierInput, type LoadOptions } from './classifier.ts'

const port = parentPort
if (!port) throw new Error('worker-entry 는 worker_threads 에서만 실행한다')

try {
  const model = await ContextClassifier.load(workerData as LoadOptions)
  port.on('message', async ({ id, input }: { id: number; input: ClassifierInput }) => {
    try {
      port.postMessage({ id, ok: true, result: await model.classify(input) })
    } catch (e) {
      port.postMessage({ id, ok: false, reason: e instanceof InputInvalidError ? 'input_invalid' : 'error', message: String(e) })
    }
  })
  port.postMessage({ type: 'ready' })
} catch (e) {
  port.postMessage({ type: 'load_error', message: String(e) })
}
