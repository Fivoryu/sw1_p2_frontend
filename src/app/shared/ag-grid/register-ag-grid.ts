import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

let registered = false;

export function registerAgGridCommunityModules(): void {
  if (registered) {
    return;
  }

  ModuleRegistry.registerModules([AllCommunityModule]);
  registered = true;
}
