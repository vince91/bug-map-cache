import ExpoModulesCore

public class AppMemoryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppMemory")

    // phys_footprint is what Xcode's memory gauge and React Native's perf monitor show.
    AsyncFunction("getUsedMemoryAsync") { () throws -> Double in
      var info = task_vm_info_data_t()
      var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
      let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
          task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
      }

      guard result == KERN_SUCCESS else {
        throw TaskInfoException(result)
      }

      return Double(info.phys_footprint)
    }
  }
}

internal final class TaskInfoException: GenericException<kern_return_t> {
  override var reason: String {
    "task_info(TASK_VM_INFO) failed with kern_return_t \(param)"
  }
}
