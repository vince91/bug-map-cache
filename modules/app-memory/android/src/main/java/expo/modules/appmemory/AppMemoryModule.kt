package expo.modules.appmemory

import android.os.Debug
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AppMemoryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppMemory")

    // Total PSS of this process, which the API gives in KB. Reading it walks the process's
    // memory mappings, which is not instant: async so the JS thread is not blocked meanwhile.
    AsyncFunction("getUsedMemoryAsync") {
      val info = Debug.MemoryInfo()
      Debug.getMemoryInfo(info)
      info.totalPss * 1024.0
    }
  }
}
