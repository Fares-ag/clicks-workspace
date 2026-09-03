import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/paginated_list_screen.dart';

class AdminManagementScreen extends StatelessWidget {
  const AdminManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin management')),
      body: PaginatedListScreen(
        endpoint: EndPoints.admins,
        emptyMessage: 'No admins',
        searchHint: 'Search admins',
        itemBuilder: (context, item) {
          final name =
              '${item['firstName'] ?? ''} ${item['lastName'] ?? ''}'.trim();
          return ListTile(
            title: Text(name.isEmpty ? 'Admin' : name),
            subtitle: Text(item['role']?.toString() ?? ''),
          );
        },
      ),
    );
  }
}
