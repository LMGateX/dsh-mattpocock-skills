import { writeFile } from 'node:fs/promises'

export const name = 'dsh-mattpocock-phase4-verifier'
export const inject = ['skills']

/** Inspect the installed provider through an actual booted DSH Skill Registry. */
export async function apply(ctx, config) {
  const summaries = (await ctx.skills.list()).filter((skill) => skill.provider === 'dsh-mattpocock-skills')
  const names = summaries.map((skill) => skill.name)
  const implementSpec = summaries.find((skill) => skill.name === 'implement-spec')
  const expectedCount = config.channel === 'beta' ? 26 : 25
  if (summaries.length !== expectedCount) throw new Error('unexpected package Skill count: ' + summaries.length)
  if ((implementSpec !== undefined) !== (config.channel === 'beta')) throw new Error('implement-spec channel mismatch')
  if (implementSpec !== undefined && (implementSpec.invocation.modelInvocable !== false || implementSpec.invocation.userInvocable !== true)) {
    throw new Error('implement-spec invocation mismatch')
  }
  if (summaries.filter((skill) => skill.invocation.modelInvocable).length !== 11) throw new Error('model-visible count mismatch')
  if (summaries.filter((skill) => skill.invocation.userInvocable).length !== expectedCount) throw new Error('user-invocable count mismatch')

  const definition = await ctx.skills.get(config.channel === 'beta' ? 'implement-spec' : 'triage')
  if (definition?.provider !== 'dsh-mattpocock-skills' || definition.resourceBase?.kind !== 'directory' || definition.content.length === 0) {
    throw new Error('lazy definition mismatch')
  }

  await writeFile(config.output, JSON.stringify({
    channel: config.channel,
    count: summaries.length,
    names,
    definition: definition.name,
  }, null, 2) + String.fromCharCode(10))
}
