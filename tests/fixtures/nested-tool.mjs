// Test-only adapter: model-direct calls go through the selected root. For mechanical
// nested probes that supply a real parent token, use the public staged pipeline.
export async function executeRegistryTool(ctx, input, load) {
  if (input.parent === undefined) {
    const batch = await ctx.tools.execute({
      calls: [{ type: 'tool-call', id: input.callId, name: input.name, arguments: JSON.stringify(input.arguments) }],
      agent: input.agent, signal: input.signal, toolStep: input.toolStep,
    })
    return batch.results[0].result
  }
  const { ToolExecutionPipeline } = await load('@deepseek-ai/dsh-tools/pipeline')
  const pipeline = new ToolExecutionPipeline(ctx, { get(name, agent, step) {
    const definition = ctx.tools.get(name, agent)
    return definition !== undefined && (step?.declares(definition) ?? true) ? definition : undefined
  } })
  const preparation = await pipeline.prepare(input)
  return pipeline.complete(preparation.exec, preparation.kind === 'dispatch' ? await pipeline.dispatch(preparation.exec) : preparation)
}

// Opt in only for model-step dispatch. Direct or stale-step probes must call
// executeRegistryTool with their original input, without refreshing admission.
export async function executeModelTool(ctx, input, load) {
  const { ToolStep } = await load('@deepseek-ai/dsh-tools/pipeline')
  return executeRegistryTool(ctx, { ...input, toolStep: ToolStep.capture(ctx.tools, input.agent) }, load)
}
