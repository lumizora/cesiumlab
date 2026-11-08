/**
 * Minimal experiment contract v0.1. The Playground owns the container and
 * passes it to the experiment; the experiment may create its own Viewer and is
 * responsible for releasing everything it created when cleanup is called.
 *
 * This contract deliberately does not assume a shared Viewer, parameter schema,
 * pause/reset API or any other common Runtime. It will be revised only after
 * multiple real experiments reveal a repeated need.
 */
export interface ExperimentMountContext {
  container: HTMLElement;
  /**
   * Reports an asynchronous runtime failure (for example a lost WebGL context)
   * to the Playground so it can show its error state and release the scene.
   */
  onError?: (error: unknown) => void;
}

export type ExperimentCleanup = () => void;

export interface ExperimentModule {
  mount(context: ExperimentMountContext): Promise<void | ExperimentCleanup>;
}
