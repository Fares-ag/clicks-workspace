import 'package:clicks_technician/core/constants/job_status_labels.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Shared formatting for Activity / job cards (Figma labels).
class JobDisplay {
  static String ocId(Map<String, dynamic> job) {
    // Technician-entered Job ID; legacy jobs fall back to the mongo id tail.
    final ref = (job['job_reference'] ?? '').toString().trim();
    if (ref.isNotEmpty) return ref;
    final id = (job['_id'] ?? job['job_id'] ?? '').toString();
    if (id.isEmpty) return '—';
    final tail = id.length > 6 ? id.substring(id.length - 6) : id;
    return '#$tail';
  }

  static String formatWhen(Map<String, dynamic> job) {
    final raw = job['dateTime'] ?? job['createdAt'] ?? job['assigned_at'];
    final dt = raw is DateTime
        ? raw
        : DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '—';
    return DateFormat('MMM d, yyyy - h:mm a').format(dt.toLocal());
  }

  static String vehicleLine(Map<String, dynamic> job) {
    final v = job['customer_vehicle_id'];
    if (v is Map) {
      final make = v['vehicle_make'] is Map
          ? (v['vehicle_make']['makeName'] ?? '').toString()
          : '';
      final model = v['vehicle_model'] is Map
          ? (v['vehicle_model']['modelName'] ?? '').toString()
          : '';
      final type = v['vehicle_type'] is Map
          ? (v['vehicle_type']['typeName'] ?? '').toString()
          : '';
      final year = v['year']?.toString() ?? '';
      final plate = (v['plate_number'] ?? '').toString();
      final line = _formatVehicleBits(
        make: make,
        model: model,
        year: year,
        type: type,
        plate: plate,
      );
      if (line.isNotEmpty) return line;
    }

    // Walk-in / tech-created jobs store a snapshot on the Job itself.
    final snapLine = _formatVehicleBits(
      make: (job['vehicleMake'] ?? '').toString(),
      model: (job['vehicleModel'] ?? '').toString(),
      year: job['vehicleYear']?.toString() ?? '',
      type: '',
      plate: (job['licensePlate'] ?? '').toString(),
    );
    if (snapLine.isNotEmpty) return snapLine;

    final issue = (job['issue'] ?? '').toString();
    final type = (job['jobType'] ?? '').toString();
    if (issue.isNotEmpty && type.isNotEmpty) return '$type · $issue';
    if (issue.isNotEmpty) return issue;
    if (type.isNotEmpty) return type;
    return 'Vehicle details unavailable';
  }

  static String _formatVehicleBits({
    required String make,
    required String model,
    required String year,
    required String type,
    required String plate,
  }) {
    final name = [make, model].where((e) => e.isNotEmpty).join(' ');
    final bits = <String>[];
    if (name.isNotEmpty) bits.add(name);
    if (year.isNotEmpty) bits.add(year);
    var line = bits.join(' ');
    if (type.isNotEmpty) {
      line = line.isEmpty ? type : '$line – $type';
    }
    if (plate.isNotEmpty) {
      line = line.isEmpty
          ? 'Plate No. $plate'
          : '$line (Plate No. $plate)';
    }
    return line;
  }

  static String statusLabel(String status) => JobStatusLabels.labelFor(status);

  static Color statusColor(String status) {
    switch (status) {
      case 'in_progress':
      case 'en_route':
      case 'arrived':
        return const Color(0xFFF79009);
      case 'completed':
        return const Color(0xFF12B76A);
      case 'cancelled':
        return const Color(0xFFD92D20);
      case 'assigned':
      case 'accepted':
        return const Color(0xFF36BFFA);
      default:
        return const Color(0xFF667085);
    }
  }
}
