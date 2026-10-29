import XCTest
@testable import HooohoRecords

final class NativeAttachmentsTests: XCTestCase {
    func testSelectedBytesAreReadInBoundedChunksAndReleased() throws {
        let source = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pdf")
        let bytes = Data(repeating: 42, count: 512 * 1024 + 17)
        try bytes.write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }
        let selection = try NativeAttachmentSelection()
        defer { selection.cleanup() }
        try selection.add(source)
        let file = try XCTUnwrap(selection.files.first)
        XCTAssertEqual(file.size, bytes.count)
        let first = try XCTUnwrap(try selection.read(fileId: file.id, offset: 0)["data"] as? String)
        let second = try XCTUnwrap(try selection.read(fileId: file.id, offset: 512 * 1024)["data"] as? String)
        XCTAssertEqual(Data(base64Encoded: first)!.count, 512 * 1024)
        XCTAssertEqual(Data(base64Encoded: first)! + Data(base64Encoded: second)!, bytes)
        XCTAssertThrowsError(try selection.read(fileId: "unselected-file", offset: 0))
        XCTAssertThrowsError(try selection.read(fileId: file.id, offset: -1))
        XCTAssertThrowsError(try selection.read(fileId: file.id, offset: bytes.count))
        selection.cleanup()
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.url.path))
        XCTAssertThrowsError(try selection.read(fileId: file.id, offset: 0))
    }

    func testVideoCannotBeMixedWithOtherSelectedOriginals() throws {
        let image = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".jpg")
        let video = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mov")
        try Data([1, 2, 3]).write(to: image)
        try Data([4, 5, 6]).write(to: video)
        defer { try? FileManager.default.removeItem(at: image); try? FileManager.default.removeItem(at: video) }
        let first = try NativeAttachmentSelection(), second = try NativeAttachmentSelection()
        defer { first.cleanup(); second.cleanup() }
        try first.add(image)
        XCTAssertThrowsError(try first.add(video))
        try second.add(video)
        XCTAssertThrowsError(try second.add(image))
        XCTAssertEqual(first.files.count, 1)
        XCTAssertEqual(second.files.count, 1)
        XCTAssertEqual(second.files.first?.mime, "video/quicktime")
    }
}
