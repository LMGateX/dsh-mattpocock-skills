import { emptyStartupDocument, parseStartupDesired, parseStartupDocument, parseStartupObservation } from './startup-state.js'
import type { StartupBoot, StartupBootReceipt, StartupDesired, StartupDocument, StartupObservation, StartupStatus } from './startup-state.js'
import type { VersionedStorage } from './versioned-storage.js'
import { ControlsError, freeze, id, increment, revision } from './validation.js'

/** Trusted program seam; Host owns operator authorization and process identity.
 * Saving requests only the next process configuration: no SDK preparation here. */
export class StartupSupport {
  private readonly epoch: string
  constructor(private readonly storage: VersionedStorage<StartupDocument>, boot: StartupBoot,
    private readonly observe: (signal?: AbortSignal) => Promise<StartupObservation>) {
    this.epoch = id(boot.epoch, 'startup epoch')
  }
  private async load(signal?: AbortSignal): Promise<StartupDocument> {
    signal?.throwIfAborted()
    const raw = await this.storage.read()
    signal?.throwIfAborted()
    return raw === undefined ? emptyStartupDocument() : parseStartupDocument(raw)
  }
  private receipt(doc: StartupDocument): StartupBootReceipt | undefined {
    return doc.bootReceipts.find(receipt => receipt.epoch === this.epoch)
  }
  private async captureBoot(signal?: AbortSignal): Promise<StartupDocument> {
    let doc = await this.load(signal)
    const captured = freeze({ epoch: this.epoch, requested: doc.desired })
    for (let attempt = 0; attempt < 32; attempt += 1) {
      if (this.receipt(doc)) return doc
      const next = parseStartupDocument({ ...doc, revision: increment(doc.revision), bootReceipts: [...doc.bootReceipts, captured] })
      signal?.throwIfAborted()
      if (await this.storage.compareAndSwap(doc.revision, next)) return next
      doc = await this.load(signal)
    }
    throw new ControlsError('concurrent-update', 'startup boot capture exceeded CAS retry limit')
  }
  private status(doc: StartupDocument, observation: StartupObservation): StartupStatus {
    const boot = this.receipt(doc)!
    const enabledNow = boot.requested.startupCwdEnabled ? observation.nativeInitialCwdSupported : false
    const restartNeeded = doc.desired.startupCwdEnabled !== boot.requested.startupCwdEnabled
      || (doc.desired.startupCwdEnabled && observation.preparation.status === 'ready' && observation.nativeInitialCwdSupported === false)
    let state: StartupStatus['state']
    if (!doc.desired.startupCwdEnabled && !boot.requested.startupCwdEnabled) state = 'disabled'
    // An official loaded native capability needs no assumption of managed disk preparation.
    else if (observation.nativeInitialCwdSupported === true) state = restartNeeded ? 'pending-restart' : enabledNow ? 'enabled' : 'disabled'
    else if (['failed', 'incompatible', 'uncertain'].includes(observation.preparation.status)) state = observation.preparation.status as 'failed' | 'incompatible' | 'uncertain'
    else if (observation.preparation.status === 'not-prepared') state = observation.preparation.sdkVersion === null ? 'unsupported' : 'needs-preparation'
    else if (observation.nativeInitialCwdSupported === null) state = 'uncertain'
    else state = restartNeeded ? 'pending-restart' : 'unsupported'
    return freeze({ revision: doc.revision, desired: doc.desired, boot, enabledNow,
      nativeInitialCwdSupported: observation.nativeInitialCwdSupported, preparation: observation.preparation,
      restartNeeded, state })
  }
  async readStatus(signal?: AbortSignal): Promise<StartupStatus> {
    const doc = await this.captureBoot(signal)
    signal?.throwIfAborted()
    const observation = parseStartupObservation(await this.observe(signal))
    signal?.throwIfAborted()
    return this.status(doc, observation)
  }
  async save(desired: StartupDesired, expectedRevision: number, signal?: AbortSignal): Promise<StartupStatus> {
    const requested = parseStartupDesired(desired)
    revision(expectedRevision, 'expected startup revision')
    const doc = await this.load(signal)
    if (doc.revision !== expectedRevision) throw new ControlsError('revision-conflict', 'startup document revision changed')
    const boot = this.receipt(doc) ?? freeze({ epoch: this.epoch, requested: doc.desired })
    const observation = parseStartupObservation(await this.observe(signal))
    signal?.throwIfAborted()
    if (this.receipt(doc) && doc.desired.startupCwdEnabled === requested.startupCwdEnabled) return this.status(doc, observation)
    const next = parseStartupDocument({ ...doc, revision: increment(doc.revision), desired: requested,
      bootReceipts: this.receipt(doc) ? doc.bootReceipts : [...doc.bootReceipts, boot] })
    signal?.throwIfAborted()
    // Once CAS starts, return its actual acknowledgement (or original error), not
    // a late cancellation that would conceal a committed desired configuration.
    if (!await this.storage.compareAndSwap(expectedRevision, next)) throw new ControlsError('revision-conflict', 'startup document revision changed')
    return this.status(next, observation)
  }
}
