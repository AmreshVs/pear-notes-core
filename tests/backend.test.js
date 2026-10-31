import test from 'brittle'
import * as notesApi from '../backend/notesApi.js'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

const getStoragePath = () =>
  path.join(tmpdir(), 'pear-notes-test-' + Math.random().toString(36).substring(7))
const encryption = b4a.toString(b4a.alloc(32).fill('test-encryption-key'), 'hex')

const storage = getStoragePath()

test('backend api - setup', async (t) => {
  try {
    if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
    await notesApi.ready({ storage, encryption })
    t.ok(notesApi.notesBase, 'notesBase initialized')
    t.ok(notesApi.preferenceBase, 'preferenceBase initialized')
  } catch (e) {
    t.fail(e.message)
  }
})

test('backend api - note operations', async (t) => {
  const title = 'Test Note'
  const note = 'This is a test note content'
  const folderKey = 'test-folder'

  const key = await notesApi.insertNote({ title, note, folderKey })
  t.ok(key, 'note inserted and returned a key')

  const savedNote = await notesApi.getSingleNote({ key })
  t.is(savedNote.title, title, 'title matches')
  t.is(savedNote.note, note, 'content matches')
  t.is(savedNote.folderKey, folderKey, 'folderKey matches')

  const updatedTitle = 'Updated Test Note'
  await notesApi.updateNote({ key, title: updatedTitle, note })
  const updatedNote = await notesApi.getSingleNote({ key })
  t.is(updatedNote.title, updatedTitle, 'title updated successfully')

  const allNotes = await notesApi.getAllNotes()
  t.ok(
    allNotes.some((n) => n.key === key),
    'note found in getAllNotes'
  )

  await notesApi.deleteNote(key)
  const deletedNote = await notesApi.getSingleNote({ key })
  t.absent(deletedNote, 'note deleted successfully')
})

test('backend api - folder operations', async (t) => {
  const title = 'Test Folder'
  const key = await notesApi.insertFolder({ title })
  t.ok(key, 'folder inserted and returned a key')

  const folder = await notesApi.getSingleFolder({ key })
  t.is(folder.title, title, 'folder title matches')

  const updatedTitle = 'Updated Folder'
  await notesApi.updateFolder({ key, title: updatedTitle })
  const updatedFolder = await notesApi.getSingleFolder({ key })
  t.is(updatedFolder.title, updatedTitle, 'folder title updated')

  const allFolders = await notesApi.getAllFolders()
  t.ok(
    allFolders.some((f) => f.key === key),
    'folder found in getAllFolders'
  )

  await notesApi.deleteFolder(key)
  const deletedFolder = await notesApi.getSingleFolder({ key })
  t.absent(deletedFolder, 'folder deleted successfully')
})

test('backend api - preference operations', async (t) => {
  const key = 'theme'
  const value = 'dark'

  await notesApi.updatePreference({ key, value })
  const savedValue = await notesApi.getPreference({ key })
  t.is(savedValue, value, 'preference saved and retrieved')
})

test('backend api - file operations', async (t) => {
  const key = 'test-file-key'
  const fileName = 'test.txt'
  const buffer = b4a.from('hello world')

  const { link, combinedKey } = await notesApi.insertFile({ key, fileName, buffer })
  t.ok(link, 'file inserted and returned a link')
  t.ok(link.startsWith('http://hyperdrive/'), 'link has correct prefix')
  t.ok(combinedKey, 'combinedKey returned')

  const retrievedLink = await notesApi.getFile({ key: combinedKey })
  t.ok(retrievedLink, 'file link retrieved from drive')

  await notesApi.deleteFile(combinedKey)
  t.pass('file deleted')
})

test('backend api - subscriptions', async (t) => {
  const noteKey = await notesApi.insertNote({ title: 'Sub Test', note: 'initial', folderKey: 'f1' })
  const noteWatcher = await notesApi.susbscribeNote({ key: noteKey })

  let noteUpdated = false
  noteWatcher.on('update', () => {
    noteUpdated = true
  })
  await notesApi.updateNote({ key: noteKey, title: 'Sub Test', note: 'updated' })
  await new Promise((resolve) => setTimeout(resolve, 500))
  t.ok(noteUpdated, 'note watcher emitted update')
  await noteWatcher.close()

  const folderKey = await notesApi.insertFolder({ title: 'Sub Folder' })
  const folderWatcher = await notesApi.susbscribeFolder({ key: folderKey })
  let folderUpdated = false
  folderWatcher.on('update', () => {
    folderUpdated = true
  })
  await notesApi.updateFolder({ key: folderKey, title: 'Updated Sub Folder' })
  await new Promise((resolve) => setTimeout(resolve, 500))
  t.ok(folderUpdated, 'folder watcher emitted update')
  await folderWatcher.close()

  const folderKeysWatcher = await notesApi.susbscribeFolderKeys()
  let folderKeysUpdated = false
  folderKeysWatcher.on('update', () => {
    folderKeysUpdated = true
  })
  await notesApi.insertFolder({ title: 'Another Folder' })
  await new Promise((resolve) => setTimeout(resolve, 500))
  t.ok(folderKeysUpdated, 'folder keys watcher emitted update')
  await folderKeysWatcher.close()

  const keysWatcher = await notesApi.susbscribeNoteKeys()
  let keysUpdated = false
  keysWatcher.on('update', () => {
    keysUpdated = true
  })
  await notesApi.insertNote({ title: 'Another Note', note: 'test', folderKey: 'f1' })
  await new Promise((resolve) => setTimeout(resolve, 500))
  t.ok(keysUpdated, 'note keys watcher emitted update')
  await keysWatcher.close()

  const settingsWatcher = await notesApi.subscribeSettings()
  let settingsUpdated = false
  settingsWatcher.on('update', () => {
    settingsUpdated = true
  })
  await notesApi.updateSettings({ settings: { theme: 'light' } })
  await new Promise((resolve) => setTimeout(resolve, 500))
  t.ok(settingsUpdated, 'settings watcher emitted update')
  await settingsWatcher.close()
})

test('backend api - synced device operations', async (t) => {
  const deviceData = {
    title: 'Test Device',
    deviceType: 'mobile',
    platform: 'ios',
    localKey: b4a.toString(b4a.alloc(32).fill('device-key'), 'hex')
  }

  const key = await notesApi.insertSyncedDevice(deviceData)
  t.ok(key, 'synced device inserted')

  const device = await notesApi.getSyncedDevice({ key })
  t.is(device.title, deviceData.title, 'device title matches')

  const watcher = await notesApi.subscribeSyncedDevice({ key })
  let deviceUpdated = false
  watcher.on('update', () => {
    deviceUpdated = true
  })
  await notesApi.updateSyncedDevice({ key, title: 'Watcher Test' })
  await new Promise((resolve) => setTimeout(resolve, 500))
  t.ok(deviceUpdated, 'synced device watcher emitted update')
  await watcher.close()

  const allDeviceKeysWatcher = await notesApi.subscribeAllSyncedDeviceKeys()
  let allDevicesUpdated = false
  allDeviceKeysWatcher.on('update', () => {
    allDevicesUpdated = true
  })
  const key2 = await notesApi.insertSyncedDevice({
    title: 'Device 2',
    deviceType: 'desktop',
    platform: 'mac',
    localKey: b4a.toString(b4a.alloc(32).fill('device-key-2'), 'hex')
  })
  await new Promise((resolve) => setTimeout(resolve, 500))
  t.ok(allDevicesUpdated, 'all synced device keys watcher emitted update')
  await allDeviceKeysWatcher.close()

  await notesApi.deleteSyncedDevice(key2)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const deletedDevice = await notesApi.getSyncedDevice({ key: key2 })
  t.absent(deletedDevice, 'synced device deleted successfully')

  await notesApi.checkAndInsertLocalDevice()
  const allKeysAfter = await notesApi.getAllSyncedDeviceKeys()
  t.ok(allKeysAfter.length > 0, 'local device inserted automatically')
})

test('backend api - additional operations', async (t) => {
  const invite = await notesApi.createInvite()
  t.ok(invite && invite.id && invite.invite, 'createInvite returns invite object')

  const noteKeys = await notesApi.getAllNoteKeys()
  t.ok(noteKeys.length > 0, 'getAllNoteKeys returns keys')

  const folderKeys = await notesApi.getAllFoldersKeys()
  t.ok(folderKeys.length > 0, 'getAllFoldersKeys returns keys')

  await notesApi.updateSettings({ settings: { theme: 'dark' } })
  const updatedSettings = await notesApi.getSettings()
  t.is(updatedSettings.theme, 'dark', 'getSettings returns updated settings')
})

test('backend api - miscellaneous', async (t) => {
  const chore = await notesApi.getChore()
  t.is(typeof chore, 'object', 'getChore returns object')

  const address = notesApi.getHyperdriveAddress()
  t.ok(address, 'hyperdrive address returned')

  const unsubscribeDeviceStatus = await notesApi.subscribeDeviceStatus(() => {})
  t.is(
    typeof unsubscribeDeviceStatus,
    'function',
    'subscribeDeviceStatus returns unsubscribe function'
  )
  unsubscribeDeviceStatus()

  await notesApi.requestWriter()
  t.pass('requestWriter executed successfully')
})

test('backend api - teardown', async (t) => {
  try {
    await notesApi.destroy()
    t.pass('destroyed successfully')
  } catch (e) {
    t.fail(e.message)
  }
})

test('backend api - storage cleanup', async (t) => {
  const cleanupStorage = getStoragePath()
  try {
    try {
      if (fs.existsSync(cleanupStorage)) fs.rmSync(cleanupStorage, { recursive: true, force: true })
    } catch {}
    await notesApi.ready({ storage: cleanupStorage, encryption })
    await notesApi.insertNote({ title: 'Delete Me', note: 'test', folderKey: 'f1' })
    await notesApi.preferenceBase.destroy()
    await notesApi.clearStorage()
    t.pass('clearStorage called successfully')
    t.absent(fs.existsSync(cleanupStorage), 'storage directory removed')
    await notesApi.destroy()
  } catch (e) {
    t.fail(e.message)
  }
})
