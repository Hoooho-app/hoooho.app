import SwiftUI

private struct CardExpiryMonth {
    let calendar: Calendar
    let firstDay: Date
    let days: [Date]
    let recordsByDay: [Date: [CardRecord]]

    init(month: Date, records: [CardRecord], timeZone: TimeZone) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.firstWeekday = 2
        self.calendar = calendar

        let start = calendar.dateInterval(of: .month, for: month)?.start ?? calendar.startOfDay(for: month)
        firstDay = start
        let leadingDays = (calendar.component(.weekday, from: start) - calendar.firstWeekday + 7) % 7
        let daysInMonth = calendar.range(of: .day, in: .month, for: start)?.count ?? 0
        let weeks = (leadingDays + daysInMonth + 6) / 7
        days = (-leadingDays..<(weeks * 7 - leadingDays)).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: start).map { calendar.startOfDay(for: $0) }
        }

        var grouped: [Date: [CardRecord]] = [:]
        for record in records {
            if let expiry = record.expiry {
                grouped[calendar.startOfDay(for: expiry), default: []].append(record)
            }
        }
        recordsByDay = grouped
    }

    var year: Int { calendar.component(.year, from: firstDay) }
    var month: Int { calendar.component(.month, from: firstDay) }

    var scheduledDays: [Date] {
        days.filter { isInMonth($0) && recordsByDay[$0] != nil }
    }

    func isInMonth(_ day: Date) -> Bool {
        calendar.isDate(day, equalTo: firstDay, toGranularity: .month)
    }

    func dayTitle(_ date: Date) -> String {
        "\(calendar.component(.month, from: date))月\(calendar.component(.day, from: date))日"
    }
}

struct CardExpiryCalendar: View {
    let records: [CardRecord]
    @Binding var month: Date
    let openCard: (UUID) -> Void

    @Environment(\.timeZone) private var timeZone
    @State private var selectedDay: Date?
    @State private var presentedDay: DaySelection?
    @State private var pendingCard: UUID?

    private struct DaySelection: Identifiable {
        let date: Date
        var id: Date { date }
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 7)
    private let weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"]
    private let expiredTint = Color(red: 0.99, green: 0.79, blue: 0.53)

    var body: some View {
        let projection = CardExpiryMonth(month: month, records: records, timeZone: timeZone)
        let today = projection.calendar.startOfDay(for: Date())
        VStack(alignment: .leading, spacing: 15) {
            VStack(alignment: .leading, spacing: 6) {
                Text("02 / CALENDAR")
                    .font(.caption2.weight(.semibold)).monospaced().foregroundStyle(Glass.ice)
                Text("有效期日历")
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .foregroundStyle(Glass.text).accessibilityAddTraits(.isHeader)
                Text("按月查看证件有效期，点日期看当天到期的卡片。")
                    .font(.subheadline).foregroundStyle(Glass.muted)
            }
            monthGrid(projection, today: today)
            monthSchedule(projection, today: today)
        }
        .sheet(item: $presentedDay, onDismiss: openPendingCard) { selection in
            daySheet(selection.date, projection: projection, today: today)
                .modifier(PrivateSceneCover())
                .presentationDetents([.medium, .large])
                .preferredColorScheme(.dark)
        }
    }

    private func monthGrid(_ projection: CardExpiryMonth, today: Date) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 5) {
                Text("\(projection.year, format: .number.grouping(.never))年\(projection.month)月")
                    .font(.headline).foregroundStyle(Glass.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Button {
                    month = today
                    selectedDay = today
                } label: {
                    Text("今天").font(.footnote.weight(.semibold))
                        .padding(.horizontal, 9).padding(.vertical, 6)
                        .background(Glass.ice.opacity(0.10), in: Capsule())
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Glass.ice)
                monthArrow(-1, projection: projection)
                monthArrow(1, projection: projection)
            }
            LazyVGrid(columns: columns, spacing: 3) {
                ForEach(weekdayLabels, id: \.self) { label in
                    Text(label).font(.caption2.weight(.medium)).foregroundStyle(Glass.muted)
                        .frame(maxWidth: .infinity, minHeight: 22)
                        .accessibilityHidden(true)
                }
                ForEach(projection.days, id: \.self) { day in
                    dayCell(day, projection: projection, today: today)
                }
            }
        }
        .padding(10).glassPanel(23)
    }

    private func monthArrow(_ offset: Int, projection: CardExpiryMonth) -> some View {
        Button {
            if let destination = projection.calendar.date(byAdding: .month, value: offset, to: projection.firstDay) {
                month = destination
                selectedDay = nil
            }
        } label: {
            Image(systemName: offset < 0 ? "chevron.left" : "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Glass.text)
                .frame(width: 29, height: 28)
                .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 9))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(offset < 0 ? "上个月" : "下个月")
    }

    private func dayCell(_ day: Date, projection: CardExpiryMonth, today: Date) -> some View {
        let items = projection.recordsByDay[day] ?? []
        let isSelected = day == selectedDay
        let isToday = day == today
        let inMonth = projection.isInMonth(day)
        let accent = day < today ? expiredTint : Glass.ice
        return Button {
            if !inMonth { month = day }
            selectedDay = day
            presentedDay = DaySelection(date: day)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 3) {
                    Text(projection.calendar.component(.day, from: day), format: .number)
                        .font(.caption2.weight(isToday ? .bold : .semibold)).monospacedDigit()
                        .foregroundStyle(isToday ? Glass.ice : inMonth ? Glass.text : Glass.muted.opacity(0.62))
                    if isToday {
                        Circle().fill(Glass.ice).frame(width: 4, height: 4)
                    }
                }
                if let first = items.first {
                    Text(first.title).font(.system(size: 9, weight: .medium))
                        .foregroundStyle(accent).lineLimit(1)
                    if items.count > 1 {
                        Text("+\(items.count - 1)").font(.system(size: 9, weight: .medium)).foregroundStyle(accent)
                    }
                }
            }
            .padding(.horizontal, 4).padding(.vertical, 5)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .topLeading)
            .background(items.isEmpty ? .white.opacity(0.035) : accent.opacity(0.11),
                        in: RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Glass.ice.opacity(isSelected ? 0.75 : isToday ? 0.4 : 0),
                                  lineWidth: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isToday ? "今天，\(projection.dayTitle(day))" : projection.dayTitle(day))
        .accessibilityValue(items.isEmpty ? "没有到期卡片" : "\(items.count) 张卡片到期")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .privacySensitive()
    }

    private func monthSchedule(_ projection: CardExpiryMonth, today: Date) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("本月到期").font(.headline).foregroundStyle(Glass.text)
                .accessibilityAddTraits(.isHeader)
            if projection.scheduledDays.isEmpty {
                Text("本月没有到期卡片。有有效期的卡片会出现在对应日期。")
                    .font(.footnote).foregroundStyle(Glass.muted)
            }
            ForEach(projection.scheduledDays, id: \.self) { day in
                VStack(alignment: .leading, spacing: 6) {
                    Text(projection.dayTitle(day)).font(.caption.weight(.semibold)).foregroundStyle(Glass.muted)
                    ForEach(projection.recordsByDay[day] ?? []) { record in
                        cardRow(record, day: day, today: today) { openCard(record.id) }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassPanel(20)
    }

    private func daySheet(_ day: Date, projection: CardExpiryMonth, today: Date) -> some View {
        let items = projection.recordsByDay[day] ?? []
        return NavigationStack {
            ZStack {
                GlassBackdrop()
                ScrollView {
                    VStack(alignment: .leading, spacing: 9) {
                        Text(items.isEmpty ? "当天没有到期卡片" : "当天有 \(items.count) 张卡片到期")
                            .font(.subheadline).foregroundStyle(Glass.muted)
                        ForEach(items) { record in
                            cardRow(record, day: day, today: today) {
                                pendingCard = record.id
                                presentedDay = nil
                            }
                        }
                    }
                    .padding(20).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .navigationTitle(projection.dayTitle(day)).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("完成") { presentedDay = nil } }
            }
        }
    }

    private func cardRow(_ record: CardRecord, day: Date, today: Date, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: record.appearance.symbol)
                    .foregroundStyle(record.appearance.accent)
                    .frame(width: 33, height: 33)
                    .background(record.appearance.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 3) {
                    Text(record.title).font(.subheadline.weight(.semibold)).foregroundStyle(Glass.text)
                    Text(record.ownerName).font(.caption2).foregroundStyle(Glass.muted)
                }
                Spacer(minLength: 4)
                Text(day == today ? "今天到期" : day < today ? "已到期" : "待到期")
                    .font(.caption2.weight(.medium)).foregroundStyle(day < today ? expiredTint : Glass.ice)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Glass.muted)
            }
            .padding(8)
            .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
            .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .privacySensitive()
    }

    private func openPendingCard() {
        if let id = pendingCard {
            pendingCard = nil
            openCard(id)
        }
    }
}
