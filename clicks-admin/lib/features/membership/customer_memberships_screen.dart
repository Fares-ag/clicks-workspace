import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/api/end_points.dart';
import '../../core/components/paginated_list_screen.dart';

class CustomerMembershipsScreen extends StatelessWidget {
  const CustomerMembershipsScreen({super.key});

  String _subtitle(Map<String, dynamic> item) {
    final phone = (item['customer'] is Map)
        ? (item['customer']['phone']?.toString() ?? '')
        : '';
    final plate = (item['vehicle'] is Map)
        ? (item['vehicle']['plate']?.toString() ?? '')
        : '';
    final interval = item['interval']?.toString() ?? '';
    final end = item['endDate']?.toString() ?? '';
    return [phone, plate, interval, end].where((s) => s.isNotEmpty).join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PaginatedListScreen(
      endpoint: EndPoints.customerSubscriptions,
      emptyMessage: 'No customer memberships',
      searchHint: 'Search plan name',
      itemBuilder: (context, item) {
        return ListTile(
          title: Text(
            '${item['planName'] ?? item['planCode'] ?? 'Plan'} · ${item['status'] ?? ''}',
            style: GoogleFonts.dmSans(fontWeight: FontWeight.w600),
          ),
          subtitle: Text(_subtitle(item)),
        );
      },
      ),
    );
  }
}
