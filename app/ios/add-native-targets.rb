#!/usr/bin/env ruby
# Registers the app's own Swift sources with the Xcode project and adds the
# widget extension target — the two things `npx cap add ios` cannot know
# about. Idempotent: run it after regenerating ios/ (a Capacitor major
# upgrade, a deleted ios/ directory); an already-registered file or target
# is left alone. Needs the xcodeproj gem: `gem install --user-install xcodeproj`.
#
#   ruby ios/add-native-targets.rb
require "xcodeproj"

ROOT = File.expand_path("App", __dir__)
proj = Xcodeproj::Project.open(File.join(ROOT, "App.xcodeproj"))
app = proj.targets.find { |t| t.name == "App" } or abort "no App target"
app_group = proj.main_group["App"] or abort "no App group"

def add_file(group, target, rel, kind: :source)
  ref = group.files.find { |f| f.path == rel } || group.new_file(rel)
  phase = kind == :source ? target.source_build_phase : target.resources_build_phase
  phase.add_file_reference(ref, true) unless phase.files_references.include?(ref)
  ref
end

def add_variant(group, target, name, langs)
  vg = group.children.find { |c| c.is_a?(Xcodeproj::Project::Object::PBXVariantGroup) && c.name == name }
  vg ||= group.new_variant_group(name)
  langs.each do |lang|
    rel = "#{lang}.lproj/#{name}"
    unless vg.files.any? { |f| f.path == rel }
      f = vg.new_reference(rel)
      f.name = lang
    end
  end
  target.resources_build_phase.add_file_reference(vg, true) unless target.resources_build_phase.files_references.include?(vg)
end

# --- The app target: plugin, view controller, shared store, intent, resources
%w[PapaMapSharePlugin.swift MainViewController.swift
   Shared/TableStore.swift Shared/LocationOnce.swift Intents/NearestTableIntent.swift].each do |f|
  add_file(app_group, app, f)
end
add_file(app_group, app, "PrivacyInfo.xcprivacy", kind: :resource)
add_variant(app_group, app, "AppShortcuts.strings", %w[de])
add_variant(app_group, app, "InfoPlist.strings", %w[de en])
app_group.new_file("App.entitlements") unless app_group.files.any? { |f| f.path == "App.entitlements" }
app.build_configurations.each do |c|
  c.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements"
  c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "18.0"
end
proj.build_configurations.each { |c| c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "18.0" }
proj.root_object.known_regions |= %w[en de Base]

# --- The widget extension target
widget = proj.targets.find { |t| t.name == "PapaMapWidget" }
unless widget
  widget = proj.new_target(:app_extension, "PapaMapWidget", :ios, "18.0")
  wgroup = proj.main_group.new_group("PapaMapWidget", "PapaMapWidget")
  add_file(wgroup, widget, "PapaMapWidget.swift")
  wgroup.new_file("Info.plist")
  wgroup.new_file("PapaMapWidget.entitlements")
  # Shared with the app: the same two files, compiled into both targets.
  shared_store = app_group.files.find { |f| f.path == "Shared/TableStore.swift" }
  widget.source_build_phase.add_file_reference(shared_store, true)
  widget.frameworks_build_phase.add_file_reference(proj.frameworks_group.new_file("System/Library/Frameworks/WidgetKit.framework", :sdk_root))
  widget.frameworks_build_phase.add_file_reference(proj.frameworks_group.new_file("System/Library/Frameworks/SwiftUI.framework", :sdk_root))
  widget.build_configurations.each do |c|
    c.build_settings.merge!(
      "PRODUCT_BUNDLE_IDENTIFIER" => "de.papamap.app.widget",
      "PRODUCT_NAME" => "PapaMapWidget",
      "INFOPLIST_FILE" => "PapaMapWidget/Info.plist",
      "GENERATE_INFOPLIST_FILE" => "NO",
      "CODE_SIGN_ENTITLEMENTS" => "PapaMapWidget/PapaMapWidget.entitlements",
      "SWIFT_VERSION" => "5.0",
      "TARGETED_DEVICE_FAMILY" => "1,2",
      "IPHONEOS_DEPLOYMENT_TARGET" => "18.0",
      "MARKETING_VERSION" => "1.0",
      "CURRENT_PROJECT_VERSION" => "1",
      "SKIP_INSTALL" => "YES",
      "LD_RUNPATH_SEARCH_PATHS" => "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
      "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME" => "",
      "ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME" => "",
    )
  end
  app.add_dependency(widget)
  embed = app.copy_files_build_phases.find { |p| p.name == "Embed Foundation Extensions" } ||
          app.new_copy_files_build_phase("Embed Foundation Extensions")
  embed.dst_subfolder_spec = "13"   # PlugIns
  embed.dst_path = ""
  bf = embed.add_file_reference(widget.product_reference, true)
  bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
end

# Release is what the runner archives for TestFlight (.github/workflows/
# app-build.yml): signed by hand with the distribution certificate and the
# profiles ios/asc.mjs fetches under these names. Debug stays automatic, so a
# Mac with Xcode and the team selected still builds to a phone.
[app, widget].each do |t|
  release = t.build_configurations.find { |c| c.name == "Release" }
  release.build_settings.merge!(
    "CODE_SIGN_STYLE" => "Manual",
    "CODE_SIGN_IDENTITY" => "Apple Distribution",
    "PROVISIONING_PROFILE_SPECIFIER" => "PapaMap CI #{release.build_settings["PRODUCT_BUNDLE_IDENTIFIER"]}",
  )
end

# A shared "App" scheme, so xcodebuild on a machine that never opened the
# project in Xcode (the GitHub runner) has something to build. Xcode itself
# would generate one on first open, but as a per-user file that is not in git.
scheme_dir = File.join(proj.path, "xcshareddata", "xcschemes")
unless File.exist?(File.join(scheme_dir, "App.xcscheme"))
  scheme = Xcodeproj::XCScheme.new
  scheme.add_build_target(app)
  scheme.set_launch_target(app)
  scheme.save_as(proj.path, "App", true)
end

proj.save
puts "ok: #{proj.targets.map(&:name).join(', ')}"
