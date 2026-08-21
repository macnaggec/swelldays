import { render as testingLibraryRender } from '@testing-library/react'
import { MantineProvider, Drawer, Modal, mergeThemeOverrides } from '@mantine/core'

// Disable all Mantine transitions in tests.
// jsdom has no CSS engine so transitionend never fires; Drawer and Modal would
// keep their content in the DOM forever unless duration is 0.
const testTheme = mergeThemeOverrides({}, {
  components: {
    Drawer: Drawer.extend({
      defaultProps: {
        transitionProps: { duration: 0 },
      },
    }),
    Modal: Modal.extend({
      defaultProps: {
        transitionProps: { duration: 0 },
      },
    }),
  },
})

export function render(ui: React.ReactNode) {
  const result = testingLibraryRender(
    <MantineProvider theme={testTheme}>
      {ui}
    </MantineProvider>,
  )

  const rerender = (nextUi: React.ReactNode) => result.rerender(
    <MantineProvider theme={testTheme}>
      {nextUi}
    </MantineProvider>,
  )

  return { ...result, rerender }
}
