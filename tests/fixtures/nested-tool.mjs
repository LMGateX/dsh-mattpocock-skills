// Test-only adapter for the 0.2.2 tool-executor split. The old registry called one
// tool directly; the new registry executes model batches through an executor plugin.
// Mounted-plugin probes still need the policy, guard and parent-token behaviour of a
// nested call, so they use the public pipeline directly.
export async function executeRegistryTool(ctx, input, load) {
  if (typeof ctx.tools?.setExecutor !== 'function') return ctx.tools.execute(input)
  if (typeof load !== 'function') throw new Error('0.2.2 registry execution requires the host module loader')
  const { ToolExecutionPipeline } = await load('@deepseek-ai/dsh-tools/pipeline')
  const pipeline = new ToolExecutionPipeline(ctx)
  const preparation = await pipeline.prepare(input)
  if (preparation.kind !== 'dispatch') return preparation.result
  return pipeline.complete(preparation.exec, await pipeline.dispatch(preparation.exec))
}
